const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { receiptData, currency } = require("./fees");

const router = express.Router();
router.use(authenticate, authorize("parent"));

async function isLinked(userId, studentId) {
  const r = await pool.query(
    `SELECT 1 FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
     WHERE g.user_id = $1 AND sg.student_id = $2`,
    [userId, studentId],
  );
  return r.rows.length > 0;
}

router.get("/children/:studentId/invoices", async (req, res) => {
  if (!/^\d+$/.test(req.params.studentId))
    return res.status(400).json({ error: "Invalid student" });
  try {
    if (!(await isLinked(req.user.id, req.params.studentId))) {
      return res
        .status(403)
        .json({ error: "This student is not linked to your account" });
    }
    const inv = await pool.query(
      `SELECT v.id, v.invoice_no, to_char(v.due_date, 'YYYY-MM-DD') AS due_date, y.name AS year,
              v.gross::float AS gross, v.discount::float AS discount, v.total::float AS total,
              v.paid::float AS paid, (v.total - v.paid)::float AS balance
       FROM invoice_summary v JOIN academic_years y ON y.id = v.academic_year_id
       WHERE v.student_id = $1 AND v.status = 'active'
       ORDER BY v.id DESC`,
      [req.params.studentId],
    );
    const ids = inv.rows.map((i) => i.id);
    const items = await pool.query(
      "SELECT invoice_id, description, amount::float AS amount FROM invoice_items WHERE invoice_id = ANY($1::int[]) ORDER BY id",
      [ids],
    );
    const payments = await pool.query(
      `SELECT id, invoice_id, receipt_no, amount::float AS amount, method,
              to_char(paid_date, 'YYYY-MM-DD') AS paid_date
       FROM payments WHERE invoice_id = ANY($1::int[]) AND status = 'valid' ORDER BY id`,
      [ids],
    );
    res.json({
      currency: await currency(),
      invoices: inv.rows.map((i) => ({
        ...i,
        items: items.rows.filter((x) => x.invoice_id === i.id),
        payments: payments.rows.filter((x) => x.invoice_id === i.id),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/receipts/:paymentId", async (req, res) => {
  if (!/^\d+$/.test(req.params.paymentId))
    return res.status(400).json({ error: "Invalid receipt" });
  try {
    const data = await receiptData(req.params.paymentId);
    if (
      !data ||
      data.status !== "valid" ||
      !(await isLinked(req.user.id, data.student_id))
    ) {
      return res.status(403).json({ error: "You cannot view this receipt" });
    }
    delete data.received_by;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
