const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate, authorize("admin", "accountant"));

const METHODS = ["cash", "bank_transfer", "mobile_money", "cheque"];
const STATUSES = ["paid", "partial", "unpaid", "overdue", "cancelled"];
const PAGE = 15;

const isId = (v) => /^\d+$/.test(String(v));
const isDate = (d) =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !isNaN(Date.parse(d));
const cents = (s) => Math.round(Number(s) * 100);

// A money value is a string like 1500 or 1500.50 (max 2 decimals), never negative
function money(v) {
  const s = String(v ?? "").trim();
  return /^\d{1,10}(\.\d{1,2})?$/.test(s) ? s : null;
}

function fail(message) {
  const err = new Error(message);
  err.user = true;
  throw err;
}

function handle(res, err) {
  if (err.user) return res.status(400).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Server error" });
}

router.param("id", (req, res, next, v) =>
  isId(v) ? next() : res.status(400).json({ error: "Invalid id" }),
);

async function activeYearId() {
  const r = await pool.query(
    "SELECT id FROM academic_years WHERE status = 'active'",
  );
  return r.rows[0]?.id || null;
}

async function currency() {
  const r = await pool.query(
    "SELECT value FROM school_settings WHERE key = 'currency'",
  );
  return r.rows[0]?.value || "ETB";
}

const INSERT_INVOICE = `
  INSERT INTO invoices (invoice_no, student_id, academic_year_id, due_date, discount, discount_reason, created_by)
  VALUES ('INV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('invoice_seq')::text, 6, '0'),
          $1, $2, $3, $4, $5, $6)
  RETURNING id, invoice_no`;

// ---------- lookups and settings ----------

router.get("/lookups", async (req, res) => {
  try {
    const years = (
      await pool.query(
        "SELECT id, name, status FROM academic_years ORDER BY start_date DESC",
      )
    ).rows;
    const active = years.find((y) => y.status === "active");
    const yearId = isId(req.query.year_id)
      ? Number(req.query.year_id)
      : active?.id || years[0]?.id || null;
    const classes = yearId
      ? (
          await pool.query(
            `SELECT id, name, section FROM classes WHERE academic_year_id = $1::int
           ORDER BY CAST(SUBSTRING(name FROM '[0-9]+') AS INT), section`,
            [yearId],
          )
        ).rows
      : [];
    const types = (
      await pool.query("SELECT id, name, active FROM fee_types ORDER BY id")
    ).rows;
    res.json({
      years,
      year_id: yearId,
      classes,
      fee_types: types,
      currency: await currency(),
    });
  } catch (err) {
    handle(res, err);
  }
});

router.put("/currency", authorize("admin"), async (req, res) => {
  const c = String(req.body.currency || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(c))
    return res
      .status(400)
      .json({ error: "Use a 3-letter currency code such as ETB" });
  try {
    await pool.query(
      `INSERT INTO school_settings (key, value) VALUES ('currency', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [c],
    );
    res.json({ currency: c });
  } catch (err) {
    handle(res, err);
  }
});

router.post("/types", async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name || name.length > 100)
    return res
      .status(400)
      .json({ error: "Enter a fee name (up to 100 characters)" });
  try {
    const r = await pool.query(
      "INSERT INTO fee_types (name) VALUES ($1) RETURNING id, name, active",
      [name],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    if (err.code === "23505")
      return res.status(400).json({ error: "That fee type already exists" });
    handle(res, err);
  }
});

router.put("/types/:id", async (req, res) => {
  if (typeof req.body.active !== "boolean")
    return res.status(400).json({ error: "active must be true or false" });
  try {
    const r = await pool.query(
      "UPDATE fee_types SET active = $1 WHERE id = $2 RETURNING id",
      [req.body.active, req.params.id],
    );
    if (r.rows.length === 0)
      return res.status(404).json({ error: "Fee type not found" });
    res.json({ message: "Updated" });
  } catch (err) {
    handle(res, err);
  }
});

// ---------- fee structure (amount per grade, per fee type, per year) ----------

router.get("/structures", async (req, res) => {
  if (!isId(req.query.year_id))
    return res.status(400).json({ error: "year_id is required" });
  try {
    const r = await pool.query(
      "SELECT grade_no, fee_type_id, amount::float AS amount FROM fee_structures WHERE academic_year_id = $1::int",
      [req.query.year_id],
    );
    res.json(r.rows);
  } catch (err) {
    handle(res, err);
  }
});

router.put("/structures", async (req, res) => {
  const { year_id, rows } = req.body;
  if (!isId(year_id) || !Array.isArray(rows) || rows.length > 1000) {
    return res.status(400).json({ error: "year_id and rows are required" });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const y = await client.query(
      "SELECT status FROM academic_years WHERE id = $1::int",
      [year_id],
    );
    if (!y.rows[0]) fail("Academic year not found");
    if (y.rows[0].status === "closed")
      fail("This academic year is closed. Fees are read-only.");

    for (const r of rows) {
      const g = Number(r.grade_no);
      if (!Number.isInteger(g) || g < 1 || g > 12 || !isId(r.fee_type_id))
        fail("Invalid row");
      const blank =
        r.amount === null ||
        r.amount === undefined ||
        String(r.amount).trim() === "";
      if (blank) {
        await client.query(
          "DELETE FROM fee_structures WHERE academic_year_id = $1::int AND grade_no = $2 AND fee_type_id = $3::int",
          [year_id, g, r.fee_type_id],
        );
      } else {
        const amount = money(r.amount);
        if (amount === null) fail(`Invalid amount for Grade ${g}`);
        await client.query(
          `INSERT INTO fee_structures (academic_year_id, grade_no, fee_type_id, amount)
           VALUES ($1::int, $2, $3::int, $4)
           ON CONFLICT (academic_year_id, grade_no, fee_type_id) DO UPDATE SET amount = EXCLUDED.amount`,
          [year_id, g, r.fee_type_id, amount],
        );
      }
    }
    await client.query("COMMIT");
    res.json({ message: "Fees saved" });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// ---------- invoices ----------

router.get("/students", async (req, res) => {
  const q = String(req.query.search || "").trim();
  if (q.length < 2) return res.json([]);
  try {
    const r = await pool.query(
      `SELECT s.id, s.full_name, c.name AS class_name, c.section
       FROM students s LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.status = 'active' AND s.full_name ILIKE $1
       ORDER BY s.full_name LIMIT 20`,
      [`%${q}%`],
    );
    res.json(r.rows);
  } catch (err) {
    handle(res, err);
  }
});

router.get("/invoices", async (req, res) => {
  try {
    const yearId = isId(req.query.year_id)
      ? Number(req.query.year_id)
      : await activeYearId();
    if (!yearId) return res.json({ rows: [], total: 0, page: 1, pages: 1 });
    const classId = isId(req.query.class_id)
      ? Number(req.query.class_id)
      : null;
    const status = STATUSES.includes(req.query.status)
      ? req.query.status
      : null;
    const search = String(req.query.search || "").trim();
    const like = search ? `%${search}%` : null;
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const r = await pool.query(
      `WITH l AS (
         SELECT v.id, v.invoice_no, to_char(v.due_date, 'YYYY-MM-DD') AS due_date,
                s.id AS student_id, s.full_name, c.name AS class_name, c.section,
                v.total::float AS total, v.paid::float AS paid, (v.total - v.paid)::float AS balance,
                CASE WHEN v.status = 'cancelled' THEN 'cancelled'
                     WHEN v.total - v.paid <= 0 THEN 'paid'
                     WHEN v.due_date < CURRENT_DATE THEN 'overdue'
                     WHEN v.paid > 0 THEN 'partial'
                     ELSE 'unpaid' END AS pay_status
         FROM invoice_summary v
         JOIN students s ON s.id = v.student_id
         LEFT JOIN student_enrollments en ON en.student_id = s.id AND en.academic_year_id = v.academic_year_id
         LEFT JOIN classes c ON c.id = en.class_id
         WHERE v.academic_year_id = $1::int
           AND ($2::int IS NULL OR c.id = $2::int)
           AND ($4::text IS NULL OR s.full_name ILIKE $4::text OR v.invoice_no ILIKE $4::text)
       )
       SELECT *, (COUNT(*) OVER ())::int AS total_rows
       FROM l WHERE ($3::text IS NULL OR pay_status = $3::text)
       ORDER BY id DESC LIMIT ${PAGE} OFFSET $5::int`,
      [yearId, classId, status, like, (page - 1) * PAGE],
    );
    const total = r.rows[0]?.total_rows || 0;
    res.json({
      rows: r.rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
    });
  } catch (err) {
    handle(res, err);
  }
});

router.get("/invoices/:id", async (req, res) => {
  try {
    const inv = await pool.query(
      `SELECT v.id, v.invoice_no, v.status, i.cancel_reason, to_char(v.due_date, 'YYYY-MM-DD') AS due_date,
              v.gross::float AS gross, v.discount::float AS discount, v.discount_reason,
              v.total::float AS total, v.paid::float AS paid, (v.total - v.paid)::float AS balance,
              s.id AS student_id, s.full_name, y.name AS year, c.name AS class_name, c.section
       FROM invoice_summary v
       JOIN invoices i ON i.id = v.id
       JOIN students s ON s.id = v.student_id
       JOIN academic_years y ON y.id = v.academic_year_id
       LEFT JOIN student_enrollments en ON en.student_id = s.id AND en.academic_year_id = v.academic_year_id
       LEFT JOIN classes c ON c.id = en.class_id
       WHERE v.id = $1`,
      [req.params.id],
    );
    if (inv.rows.length === 0)
      return res.status(404).json({ error: "Invoice not found" });
    const items = await pool.query(
      "SELECT id, description, amount::float AS amount FROM invoice_items WHERE invoice_id = $1 ORDER BY id",
      [req.params.id],
    );
    const payments = await pool.query(
      `SELECT id, receipt_no, amount::float AS amount, method, reference,
              to_char(paid_date, 'YYYY-MM-DD') AS paid_date, status, void_reason
       FROM payments WHERE invoice_id = $1 ORDER BY id`,
      [req.params.id],
    );
    res.json({ ...inv.rows[0], items: items.rows, payments: payments.rows });
  } catch (err) {
    handle(res, err);
  }
});

// A custom invoice for one student
router.post("/invoices", async (req, res) => {
  const { student_id, year_id, due_date, items, discount, discount_reason } =
    req.body;
  if (!isId(student_id))
    return res.status(400).json({ error: "Choose a student" });
  if (due_date && !isDate(due_date))
    return res.status(400).json({ error: "Enter a valid due date" });
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) {
    return res.status(400).json({ error: "Add 1 to 20 items" });
  }
  const clean = [];
  for (const it of items) {
    const description = String(it.description || "").trim();
    const amount = money(it.amount);
    if (
      !description ||
      description.length > 200 ||
      amount === null ||
      Number(amount) <= 0
    ) {
      return res
        .status(400)
        .json({ error: "Each item needs a description and an amount above 0" });
    }
    clean.push({ description, amount });
  }
  const disc = money(discount || "0");
  if (disc === null)
    return res.status(400).json({ error: "Enter a valid discount" });
  if (Number(disc) > 0) {
    if (req.user.role !== "admin")
      return res
        .status(403)
        .json({ error: "Only an admin can give a discount" });
    if (!String(discount_reason || "").trim())
      return res.status(400).json({ error: "Give a reason for the discount" });
  }
  const gross = clean.reduce((a, x) => a + cents(x.amount), 0);
  if (cents(disc) > gross)
    return res
      .status(400)
      .json({ error: "The discount is more than the invoice total" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const student = await client.query(
      "SELECT id FROM students WHERE id = $1::int AND status = 'active'",
      [student_id],
    );
    if (!student.rows[0]) fail("Student not found");
    const yearId = isId(year_id) ? Number(year_id) : await activeYearId();
    if (!yearId) fail("There is no active academic year");
    const y = await client.query(
      "SELECT status FROM academic_years WHERE id = $1::int",
      [yearId],
    );
    if (!y.rows[0]) fail("Academic year not found");
    if (y.rows[0].status === "closed") fail("This academic year is closed");

    const inv = await client.query(INSERT_INVOICE, [
      student_id,
      yearId,
      due_date || null,
      disc,
      Number(disc) > 0 ? String(discount_reason).trim().slice(0, 200) : null,
      req.user.id,
    ]);
    for (const it of clean) {
      await client.query(
        "INSERT INTO invoice_items (invoice_id, description, amount) VALUES ($1, $2, $3)",
        [inv.rows[0].id, it.description, it.amount],
      );
    }
    await client.query("COMMIT");
    res.status(201).json(inv.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// One invoice per active enrolled student, from the fee structure
router.post("/invoices/generate", async (req, res) => {
  const { year_id, class_id, grade_no, due_date } = req.body;
  if (!isId(year_id))
    return res.status(400).json({ error: "Choose an academic year" });
  if (due_date && !isDate(due_date))
    return res.status(400).json({ error: "Enter a valid due date" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const y = await client.query(
      "SELECT status FROM academic_years WHERE id = $1::int",
      [year_id],
    );
    if (!y.rows[0]) fail("Academic year not found");
    if (y.rows[0].status === "closed") fail("This academic year is closed");

    const structs = await client.query(
      `SELECT fs.grade_no, t.name, fs.amount
       FROM fee_structures fs JOIN fee_types t ON t.id = fs.fee_type_id
       WHERE fs.academic_year_id = $1::int AND t.active AND fs.amount > 0
       ORDER BY t.id`,
      [year_id],
    );
    const byGrade = {};
    structs.rows.forEach((r) => {
      if (!byGrade[r.grade_no]) byGrade[r.grade_no] = [];
      byGrade[r.grade_no].push(r);
    });

    const students = await client.query(
      `SELECT en.student_id, CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT) AS grade_no
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id AND s.status = 'active'
       JOIN classes c ON c.id = en.class_id
       WHERE en.academic_year_id = $1::int AND en.status = 'enrolled'
         AND ($2::int IS NULL OR c.id = $2::int)
         AND ($3::int IS NULL OR CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT) = $3::int)`,
      [
        year_id,
        isId(class_id) ? Number(class_id) : null,
        isId(grade_no) ? Number(grade_no) : null,
      ],
    );
    const existing = await client.query(
      "SELECT student_id FROM invoices WHERE academic_year_id = $1::int AND status = 'active'",
      [year_id],
    );
    const have = new Set(existing.rows.map((r) => r.student_id));

    let created = 0;
    let skippedExisting = 0;
    let noStructure = 0;
    for (const s of students.rows) {
      if (have.has(s.student_id)) {
        skippedExisting++;
        continue;
      }
      const items = byGrade[s.grade_no];
      if (!items || items.length === 0) {
        noStructure++;
        continue;
      }
      const inv = await client.query(INSERT_INVOICE, [
        s.student_id,
        year_id,
        due_date || null,
        "0",
        null,
        req.user.id,
      ]);
      for (const it of items) {
        await client.query(
          "INSERT INTO invoice_items (invoice_id, description, amount) VALUES ($1, $2, $3)",
          [inv.rows[0].id, it.name, it.amount],
        );
      }
      created++;
    }
    await client.query("COMMIT");
    res.json({
      created,
      skipped_existing: skippedExisting,
      no_structure: noStructure,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// Admin only: set or change the discount
router.put("/invoices/:id/discount", authorize("admin"), async (req, res) => {
  const disc = money(req.body.discount || "0");
  const reason = String(req.body.reason || "")
    .trim()
    .slice(0, 200);
  if (disc === null)
    return res.status(400).json({ error: "Enter a valid discount" });
  if (!reason) return res.status(400).json({ error: "Give a reason" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inv = await client.query(
      "SELECT status FROM invoices WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!inv.rows[0]) fail("Invoice not found");
    if (inv.rows[0].status === "cancelled") fail("This invoice is cancelled");
    const chk = await client.query(
      "SELECT ($2::numeric <= gross) AS fits, (gross - $2::numeric >= paid) AS covers FROM invoice_summary WHERE id = $1",
      [req.params.id, disc],
    );
    if (!chk.rows[0].fits) fail("The discount is more than the invoice total");
    if (!chk.rows[0].covers)
      fail(
        "The discount would make the invoice less than what was already paid",
      );
    await client.query(
      "UPDATE invoices SET discount = $1, discount_reason = $2 WHERE id = $3",
      [disc, reason, req.params.id],
    );
    await client.query("COMMIT");
    res.json({ message: "Discount saved" });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// Admin only: cancel an invoice that has no valid payments
router.post("/invoices/:id/cancel", authorize("admin"), async (req, res) => {
  const reason = String(req.body.reason || "")
    .trim()
    .slice(0, 200);
  if (!reason) return res.status(400).json({ error: "Give a reason" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inv = await client.query(
      "SELECT status FROM invoices WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!inv.rows[0]) fail("Invoice not found");
    if (inv.rows[0].status === "cancelled")
      fail("This invoice is already cancelled");
    const paid = await client.query(
      "SELECT paid FROM invoice_summary WHERE id = $1",
      [req.params.id],
    );
    if (Number(paid.rows[0].paid) > 0)
      fail("This invoice has payments. Void them first.");
    await client.query(
      "UPDATE invoices SET status = 'cancelled', cancel_reason = $1, cancelled_at = NOW() WHERE id = $2",
      [reason, req.params.id],
    );
    await client.query("COMMIT");
    res.json({ message: "Invoice cancelled" });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// ---------- payments ----------

router.post("/invoices/:id/payments", async (req, res) => {
  const amount = money(req.body.amount);
  if (amount === null || Number(amount) <= 0)
    return res.status(400).json({ error: "Enter a valid amount" });
  if (!METHODS.includes(req.body.method))
    return res.status(400).json({ error: "Choose a payment method" });
  const paidDate = req.body.paid_date || null;
  if (paidDate && !isDate(paidDate))
    return res.status(400).json({ error: "Enter a valid payment date" });
  if (paidDate && paidDate > new Date().toLocaleDateString("en-CA")) {
    return res
      .status(400)
      .json({ error: "The payment date cannot be in the future" });
  }
  const reference =
    String(req.body.reference || "")
      .trim()
      .slice(0, 100) || null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // The row lock makes two cashiers paying the same invoice wait for each other
    const inv = await client.query(
      "SELECT status FROM invoices WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!inv.rows[0]) fail("Invoice not found");
    if (inv.rows[0].status === "cancelled") fail("This invoice is cancelled");

    const chk = await client.query(
      "SELECT (total - paid) AS balance, (total - paid >= $2::numeric) AS ok FROM invoice_summary WHERE id = $1",
      [req.params.id, amount],
    );
    if (!chk.rows[0].ok)
      fail(`The payment is more than the balance (${chk.rows[0].balance})`);

    const p = await client.query(
      `INSERT INTO payments (receipt_no, invoice_id, amount, method, reference, paid_date, received_by)
       VALUES ('RCT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('receipt_seq')::text, 6, '0'),
               $1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), $6)
       RETURNING id, receipt_no`,
      [
        req.params.id,
        amount,
        req.body.method,
        reference,
        paidDate,
        req.user.id,
      ],
    );
    await client.query("COMMIT");
    res.status(201).json(p.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// Admin only: a payment is never deleted or edited, only voided with a reason
router.post("/payments/:id/void", authorize("admin"), async (req, res) => {
  const reason = String(req.body.reason || "")
    .trim()
    .slice(0, 200);
  if (!reason) return res.status(400).json({ error: "Give a reason" });
  try {
    const r = await pool.query(
      `UPDATE payments SET status = 'voided', void_reason = $1, voided_by = $2, voided_at = NOW()
       WHERE id = $3 AND status = 'valid' RETURNING id`,
      [reason, req.user.id, req.params.id],
    );
    if (r.rows.length === 0)
      return res
        .status(400)
        .json({ error: "Payment not found or already voided" });
    res.json({ message: "Payment voided" });
  } catch (err) {
    handle(res, err);
  }
});

router.get("/payments", async (req, res) => {
  try {
    const from = isDate(req.query.from) ? req.query.from : null;
    const to = isDate(req.query.to) ? req.query.to : null;
    const method = METHODS.includes(req.query.method) ? req.query.method : null;
    const search = String(req.query.search || "").trim();
    const like = search ? `%${search}%` : null;
    const page = Math.max(1, parseInt(req.query.page) || 1);

    const r = await pool.query(
      `SELECT p.id, p.receipt_no, p.amount::float AS amount, p.method, p.reference,
              to_char(p.paid_date, 'YYYY-MM-DD') AS paid_date, p.status,
              i.invoice_no, s.full_name, u.email AS received_by,
              (COUNT(*) OVER ())::int AS total_rows,
              (COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'valid') OVER (), 0))::float AS collected
       FROM payments p
       JOIN invoices i ON i.id = p.invoice_id
       JOIN students s ON s.id = i.student_id
       LEFT JOIN users u ON u.id = p.received_by
       WHERE ($1::date IS NULL OR p.paid_date >= $1::date)
         AND ($2::date IS NULL OR p.paid_date <= $2::date)
         AND ($3::text IS NULL OR p.method = $3::text)
         AND ($4::text IS NULL OR s.full_name ILIKE $4::text OR p.receipt_no ILIKE $4::text OR i.invoice_no ILIKE $4::text)
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ${PAGE} OFFSET $5::int`,
      [from, to, method, like, (page - 1) * PAGE],
    );
    const total = r.rows[0]?.total_rows || 0;
    res.json({
      rows: r.rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / PAGE)),
      collected: r.rows[0]?.collected || 0,
    });
  } catch (err) {
    handle(res, err);
  }
});

// ---------- receipts ----------

async function receiptData(paymentId) {
  const r = await pool.query(
    `SELECT p.receipt_no, p.amount::float AS amount, p.method, p.reference,
            to_char(p.paid_date, 'YYYY-MM-DD') AS paid_date, p.status, p.void_reason,
            v.invoice_no, v.total::float AS invoice_total, v.paid::float AS invoice_paid,
            (v.total - v.paid)::float AS invoice_balance,
            s.id AS student_id, s.full_name, c.name AS class_name, c.section, y.name AS year,
            u.email AS received_by
     FROM payments p
     JOIN invoice_summary v ON v.id = p.invoice_id
     JOIN students s ON s.id = v.student_id
     JOIN academic_years y ON y.id = v.academic_year_id
     LEFT JOIN student_enrollments en ON en.student_id = s.id AND en.academic_year_id = v.academic_year_id
     LEFT JOIN classes c ON c.id = en.class_id
     LEFT JOIN users u ON u.id = p.received_by
     WHERE p.id = $1`,
    [paymentId],
  );
  if (!r.rows[0]) return null;
  return { ...r.rows[0], currency: await currency() };
}

router.get("/receipts/:id", async (req, res) => {
  try {
    const data = await receiptData(req.params.id);
    if (!data) return res.status(404).json({ error: "Receipt not found" });
    res.json(data);
  } catch (err) {
    handle(res, err);
  }
});

// ---------- reports ----------

router.get("/reports/summary", async (req, res) => {
  try {
    const yearId = isId(req.query.year_id)
      ? Number(req.query.year_id)
      : await activeYearId();
    if (!yearId) return res.json(null);

    const totals = await pool.query(
      `SELECT COALESCE(SUM(total), 0)::float AS invoiced, COALESCE(SUM(paid), 0)::float AS collected,
              COALESCE(SUM(total - paid), 0)::float AS outstanding, COUNT(*)::int AS invoices
       FROM invoice_summary WHERE academic_year_id = $1::int AND status = 'active'`,
      [yearId],
    );
    const perGrade = await pool.query(
      `SELECT CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT) AS grade_no, COUNT(*)::int AS invoices,
              SUM(v.total)::float AS invoiced, SUM(v.paid)::float AS collected,
              SUM(v.total - v.paid)::float AS outstanding
       FROM invoice_summary v
       JOIN student_enrollments en ON en.student_id = v.student_id AND en.academic_year_id = v.academic_year_id
       JOIN classes c ON c.id = en.class_id
       WHERE v.academic_year_id = $1::int AND v.status = 'active'
       GROUP BY 1 ORDER BY 1`,
      [yearId],
    );
    const methods = await pool.query(
      `SELECT p.method, COUNT(*)::int AS payments, SUM(p.amount)::float AS amount
       FROM payments p JOIN invoices i ON i.id = p.invoice_id
       WHERE i.academic_year_id = $1::int AND p.status = 'valid'
       GROUP BY p.method ORDER BY 3 DESC`,
      [yearId],
    );
    const debtors = await pool.query(
      `SELECT s.id AS student_id, s.full_name, c.name AS class_name, c.section, v.invoice_no,
              (v.total - v.paid)::float AS balance, to_char(v.due_date, 'YYYY-MM-DD') AS due_date,
              (SELECT string_agg(g.full_name || COALESCE(' (' || g.phone || ')', ''), ', ')
               FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
               WHERE sg.student_id = s.id) AS parents
       FROM invoice_summary v
       JOIN students s ON s.id = v.student_id
       LEFT JOIN student_enrollments en ON en.student_id = s.id AND en.academic_year_id = v.academic_year_id
       LEFT JOIN classes c ON c.id = en.class_id
       WHERE v.academic_year_id = $1::int AND v.status = 'active' AND v.total - v.paid > 0
       ORDER BY v.total - v.paid DESC LIMIT 50`,
      [yearId],
    );
    res.json({
      currency: await currency(),
      ...totals.rows[0],
      per_grade: perGrade.rows,
      methods: methods.rows,
      debtors: debtors.rows,
    });
  } catch (err) {
    handle(res, err);
  }
});

module.exports = router;
module.exports.receiptData = receiptData;
module.exports.currency = currency;
