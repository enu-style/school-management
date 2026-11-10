import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  api,
  bearer,
  pool,
  resetDb,
  createUser,
  createYear,
  createClass,
  createStudent,
  tokenFor,
} from "./helpers.js";

let year, closedYear, S1, S2, S3, accountant;
let adminToken, accountantToken, teacherToken;
let tuition, registration, transport;
let inv1, inv2, inv3, inv4, pay1, pay2;

beforeAll(async () => {
  await resetDb();
  year = await createYear("2026/2027");
  closedYear = await createYear("2025/2026", "closed");
  const g1 = await createClass(year, "Grade 1", "A");
  const g2 = await createClass(year, "Grade 2", "A");
  const g3 = await createClass(year, "Grade 3", "A");
  S1 = await createStudent("Abel Tesfaye", "s1@test.com", g1);
  S2 = await createStudent("Selam Hailu", "s2@test.com", g2);
  S3 = await createStudent("Dawit Mekonnen", "s3@test.com", g3);
  accountant = await createUser("accountant", "acc@test.com");
  accountantToken = tokenFor(accountant);
  adminToken = tokenFor(await createUser("admin", "admin@test.com"));
  teacherToken = tokenFor(await createUser("teacher", "teacher@test.com"));
});
afterAll(() => pool.end());

const call = (token, method, url, body) => {
  const r = api()[method](url).set(bearer(token));
  return body === undefined ? r : r.send(body);
};
const detail = async (id) =>
  (await call(adminToken, "get", `/api/fees/invoices/${id}`)).body;
const list = async (query = "") =>
  (
    await call(
      adminToken,
      "get",
      `/api/fees/invoices?year_id=${year.id}${query}`,
    )
  ).body.rows;
const pay = (token, id, body) =>
  call(token, "post", `/api/fees/invoices/${id}/payments`, {
    amount: "100",
    method: "cash",
    ...body,
  });
const invoiceId = async (student) =>
  (
    await pool.query(
      "SELECT id FROM invoices WHERE student_id = $1 ORDER BY id LIMIT 1",
      [student.id],
    )
  ).rows[0].id;
const RECEIPT = /^RCT-\d{4}-\d{6}$/;
const INVOICE = /^INV-\d{4}-\d{6}$/;

describe("fee types and the fee structure", () => {
  it("creates fee types and refuses duplicates and empty names", async () => {
    const t = await call(accountantToken, "post", "/api/fees/types", {
      name: "Tuition",
    });
    expect(t.status).toBe(201);
    tuition = t.body.id;
    registration = (
      await call(adminToken, "post", "/api/fees/types", {
        name: "Registration",
      })
    ).body.id;
    transport = (
      await call(adminToken, "post", "/api/fees/types", { name: "Transport" })
    ).body.id;
    expect(
      (await call(adminToken, "post", "/api/fees/types", { name: "Tuition" }))
        .status,
    ).toBe(400);
    expect(
      (await call(adminToken, "post", "/api/fees/types", { name: "  " }))
        .status,
    ).toBe(400);
  });

  it("is closed to teachers", async () => {
    expect(
      (await call(teacherToken, "post", "/api/fees/types", { name: "Sneaky" }))
        .status,
    ).toBe(403);
    expect(
      (
        await call(teacherToken, "put", "/api/fees/structures", {
          year_id: year.id,
          rows: [],
        })
      ).status,
    ).toBe(403);
  });

  it("saves the amount of each fee for each grade", async () => {
    const res = await call(accountantToken, "put", "/api/fees/structures", {
      year_id: year.id,
      rows: [
        { grade_no: 1, fee_type_id: tuition, amount: "1000" },
        { grade_no: 1, fee_type_id: registration, amount: "200" },
        { grade_no: 1, fee_type_id: transport, amount: "300" },
        { grade_no: 2, fee_type_id: tuition, amount: "1200" },
      ],
    });
    expect(res.status).toBe(200);
    const saved = await call(
      adminToken,
      "get",
      `/api/fees/structures?year_id=${year.id}`,
    );
    expect(saved.body).toHaveLength(4);
    expect(saved.body).toContainEqual({
      grade_no: 1,
      fee_type_id: tuition,
      amount: 1000,
    });
    expect(saved.body).toContainEqual({
      grade_no: 2,
      fee_type_id: tuition,
      amount: 1200,
    });
  });

  it("rejects invalid rows", async () => {
    const bad = [
      { grade_no: 1, fee_type_id: tuition, amount: "-5" },
      { grade_no: 1, fee_type_id: tuition, amount: "12.345" },
      { grade_no: 1, fee_type_id: tuition, amount: "abc" },
      { grade_no: 13, fee_type_id: tuition, amount: "10" },
      { grade_no: 0, fee_type_id: tuition, amount: "10" },
      { grade_no: 1, fee_type_id: "x", amount: "10" },
    ];
    for (const row of bad) {
      const res = await call(adminToken, "put", "/api/fees/structures", {
        year_id: year.id,
        rows: [row],
      });
      expect(res.status, JSON.stringify(row)).toBe(400);
    }
  });

  it("saves nothing when one row is invalid", async () => {
    const res = await call(adminToken, "put", "/api/fees/structures", {
      year_id: year.id,
      rows: [
        { grade_no: 3, fee_type_id: tuition, amount: "500" },
        { grade_no: 3, fee_type_id: registration, amount: "abc" },
      ],
    });
    expect(res.status).toBe(400);
    const saved = await call(
      adminToken,
      "get",
      `/api/fees/structures?year_id=${year.id}`,
    );
    expect(saved.body.some((r) => r.grade_no === 3)).toBe(false);
  });

  it("is read-only for a closed year", async () => {
    const res = await call(adminToken, "put", "/api/fees/structures", {
      year_id: closedYear.id,
      rows: [{ grade_no: 1, fee_type_id: tuition, amount: "10" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/closed/);
  });

  it("lets a fee type be switched off", async () => {
    expect(
      (
        await call(adminToken, "put", `/api/fees/types/${transport}`, {
          active: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call(adminToken, "put", `/api/fees/types/${transport}`, {
          active: "no",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(adminToken, "put", "/api/fees/types/999999", {
          active: true,
        })
      ).status,
    ).toBe(404);
  });
});

describe("generating invoices", () => {
  const generate = (body, token = accountantToken) =>
    call(token, "post", "/api/fees/invoices/generate", body);

  it("creates one invoice per enrolled student from the fee structure", async () => {
    const res = await generate({ year_id: year.id, due_date: "2099-01-01" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      created: 2,
      skipped_existing: 0,
      no_structure: 1,
    });

    inv1 = await invoiceId(S1);
    inv2 = await invoiceId(S2);
    const a = await detail(inv1);
    expect(a.invoice_no).toMatch(INVOICE);
    expect(a.items.map((i) => i.description).sort()).toEqual([
      "Registration",
      "Tuition",
    ]);
    expect(a).toMatchObject({
      gross: 1200,
      total: 1200,
      paid: 0,
      balance: 1200,
      status: "active",
      due_date: "2099-01-01",
    });
    expect((await detail(inv2)).total).toBe(1200);
  });

  it("ignores fee types that are switched off", async () => {
    const a = await detail(inv1);
    expect(a.items.map((i) => i.description)).not.toContain("Transport");
  });

  it("skips students who already have an invoice", async () => {
    const res = await generate({ year_id: year.id });
    expect(res.body).toEqual({
      created: 0,
      skipped_existing: 2,
      no_structure: 1,
    });
  });

  it("refuses a closed year, a bad date, and a missing year", async () => {
    expect((await generate({ year_id: closedYear.id })).status).toBe(400);
    expect(
      (await generate({ year_id: year.id, due_date: "tomorrow" })).status,
    ).toBe(400);
    expect((await generate({})).status).toBe(400);
  });

  it("is closed to teachers", async () => {
    expect((await generate({ year_id: year.id }, teacherToken)).status).toBe(
      403,
    );
  });
});

describe("custom invoices", () => {
  const create = (data, token = accountantToken) =>
    call(token, "post", "/api/fees/invoices", data);
  const items = [
    { description: "Lost book", amount: "150.50" },
    { description: "Uniform", amount: "49.50" },
  ];

  it("creates an invoice for one student", async () => {
    const res = await create({
      student_id: S3.id,
      due_date: "2020-01-01",
      items,
    });
    expect(res.status).toBe(201);
    expect(res.body.invoice_no).toMatch(INVOICE);
    inv3 = res.body.id;
    expect(await detail(inv3)).toMatchObject({ total: 200, balance: 200 });
  });

  it("shows an unpaid invoice as overdue after its due date", async () => {
    const rows = await list("&status=overdue");
    expect(rows.map((r) => r.full_name)).toEqual(["Dawit Mekonnen"]);
    expect(rows[0].pay_status).toBe("overdue");
    const unpaid = await list("&status=unpaid");
    expect(unpaid.map((r) => r.full_name).sort()).toEqual([
      "Abel Tesfaye",
      "Selam Hailu",
    ]);
  });

  it("finds invoices by student name", async () => {
    const rows = await list("&search=Abel");
    expect(rows.map((r) => r.full_name)).toEqual(["Abel Tesfaye"]);
  });

  it("rejects invalid items", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => ({
      description: `Item ${i}`,
      amount: "1",
    }));
    const bad = [
      { student_id: S3.id, items: [] },
      { student_id: S3.id, items: [{ description: "", amount: "10" }] },
      { student_id: S3.id, items: [{ description: "Free", amount: "0" }] },
      { student_id: S3.id, items: [{ description: "Text", amount: "abc" }] },
      { student_id: S3.id, items: [{ description: "Negative", amount: "-5" }] },
      { student_id: S3.id, items: tooMany },
      { items },
      { student_id: S3.id, items, due_date: "soon" },
    ];
    for (const body of bad) {
      expect(
        (await create(body)).status,
        JSON.stringify(body).slice(0, 60),
      ).toBe(400);
    }
  });

  it("refuses an unknown student", async () => {
    expect((await create({ student_id: 999999, items })).status).toBe(400);
  });

  it("lets only an admin give a discount, with a reason, and never more than the total", async () => {
    const withDiscount = {
      student_id: S3.id,
      items: [{ description: "Trip", amount: "100" }],
      discount: "20",
      discount_reason: "Sibling",
    };
    expect((await create(withDiscount, accountantToken)).status).toBe(403);
    expect(
      (await create({ ...withDiscount, discount_reason: "" }, adminToken))
        .status,
    ).toBe(400);
    expect(
      (await create({ ...withDiscount, discount: "500" }, adminToken)).status,
    ).toBe(400);

    const ok = await create(withDiscount, adminToken);
    expect(ok.status).toBe(201);
    inv4 = ok.body.id;
    expect(await detail(inv4)).toMatchObject({
      gross: 100,
      discount: 20,
      total: 80,
      discount_reason: "Sibling",
    });
  });

  it("is closed to teachers", async () => {
    expect(
      (await create({ student_id: S3.id, items }, teacherToken)).status,
    ).toBe(403);
  });
});

describe("recording payments", () => {
  it("records a partial payment and numbers the receipt", async () => {
    const res = await pay(accountantToken, inv1, { amount: "500" });
    expect(res.status).toBe(201);
    expect(res.body.receipt_no).toMatch(RECEIPT);
    pay1 = res.body.id;
    expect(await detail(inv1)).toMatchObject({ paid: 500, balance: 700 });
    expect((await list()).find((r) => r.id === inv1).pay_status).toBe(
      "partial",
    );
  });

  it("remembers who received the payment", async () => {
    const row = await pool.query(
      "SELECT received_by FROM payments WHERE id = $1",
      [pay1],
    );
    expect(row.rows[0].received_by).toBe(accountant.id);
  });

  it("shows the receipt with the invoice balance", async () => {
    const res = await call(
      accountantToken,
      "get",
      `/api/fees/receipts/${pay1}`,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amount: 500,
      invoice_total: 1200,
      invoice_balance: 700,
      full_name: "Abel Tesfaye",
      currency: "ETB",
      status: "valid",
    });
  });

  it("refuses a payment above the balance and records nothing", async () => {
    const res = await pay(accountantToken, inv1, { amount: "800" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/more than the balance/);
    const n = await pool.query(
      "SELECT COUNT(*)::int AS n FROM payments WHERE invoice_id = $1",
      [inv1],
    );
    expect(n.rows[0].n).toBe(1);
  });

  it("rejects invalid payments", async () => {
    const bad = [
      { amount: "0" },
      { amount: "-5" },
      { amount: "abc" },
      { amount: "10.999" },
      { amount: "" },
      { method: "bitcoin" },
      { paid_date: "2999-01-01" },
      { paid_date: "not-a-date" },
    ];
    for (const body of bad) {
      expect(
        (await pay(accountantToken, inv1, body)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
  });

  it("accepts the exact remaining balance and marks the invoice paid", async () => {
    const res = await pay(accountantToken, inv1, {
      amount: "700",
      method: "mobile_money",
      reference: "TXN-1",
    });
    expect(res.status).toBe(201);
    pay2 = res.body.id;
    expect(res.body.receipt_no).toMatch(RECEIPT);
    expect(await detail(inv1)).toMatchObject({ paid: 1200, balance: 0 });
    expect((await list()).find((r) => r.id === inv1).pay_status).toBe("paid");
  });

  it("gives every payment its own receipt number", async () => {
    const rows = await pool.query(
      "SELECT receipt_no FROM payments WHERE id = ANY($1::int[])",
      [[pay1, pay2]],
    );
    expect(new Set(rows.rows.map((r) => r.receipt_no)).size).toBe(2);
  });

  it("refuses a payment on a fully paid invoice and on an unknown invoice", async () => {
    expect((await pay(accountantToken, inv1, { amount: "1" })).status).toBe(
      400,
    );
    expect((await pay(accountantToken, 999999)).status).toBe(400);
  });

  it("lets only one of two simultaneous payments through when only one fits", async () => {
    const results = await Promise.all([
      pay(adminToken, inv2, { amount: "800" }),
      pay(accountantToken, inv2, { amount: "800" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await detail(inv2)).paid).toBe(800);
  });

  it("lists payments with filters and a total of what was collected", async () => {
    await pay(accountantToken, inv2, {
      amount: "100",
      method: "bank_transfer",
      reference: "TX9",
    });
    const all = await call(accountantToken, "get", "/api/fees/payments");
    expect(all.body.total).toBe(4);
    const bank = await call(
      accountantToken,
      "get",
      "/api/fees/payments?method=bank_transfer",
    );
    expect(bank.body.rows.map((r) => r.full_name)).toEqual(["Selam Hailu"]);
    const byName = await call(
      accountantToken,
      "get",
      "/api/fees/payments?search=Abel",
    );
    expect(byName.body.rows).toHaveLength(2);
    const future = await call(
      accountantToken,
      "get",
      "/api/fees/payments?from=2999-01-01",
    );
    expect(future.body.total).toBe(0);
  });

  it("is closed to teachers", async () => {
    expect((await pay(teacherToken, inv3)).status).toBe(403);
  });
});

describe("corrections, discounts, and cancellations (admin only)", () => {
  it("voids a payment only for an admin, with a reason", async () => {
    expect(
      (
        await call(accountantToken, "post", `/api/fees/payments/${pay2}/void`, {
          reason: "Mistake",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(adminToken, "post", `/api/fees/payments/${pay2}/void`, {}))
        .status,
    ).toBe(400);

    const res = await call(
      adminToken,
      "post",
      `/api/fees/payments/${pay2}/void`,
      { reason: "Wrong amount entered" },
    );
    expect(res.status).toBe(200);
    const d = await detail(inv1);
    expect(d).toMatchObject({ paid: 500, balance: 700 });
    expect(d.payments.find((p) => p.id === pay2)).toMatchObject({
      status: "voided",
      void_reason: "Wrong amount entered",
    });
    expect((await list()).find((r) => r.id === inv1).pay_status).toBe(
      "partial",
    );
  });

  it("cannot void the same payment twice", async () => {
    expect(
      (
        await call(adminToken, "post", `/api/fees/payments/${pay2}/void`, {
          reason: "Again",
        })
      ).status,
    ).toBe(400);
  });

  it("lets the balance be paid again after a void", async () => {
    const res = await pay(accountantToken, inv1, { amount: "700" });
    expect(res.status).toBe(201);
    expect((await detail(inv1)).balance).toBe(0);
  });

  it("protects the records in the database itself", async () => {
    await expect(pool.query("DELETE FROM payments")).rejects.toThrow(
      /cannot be deleted/,
    );
    await expect(
      pool.query("UPDATE payments SET amount = 1 WHERE id = $1", [pay1]),
    ).rejects.toThrow(/cannot be edited/);
    await expect(
      pool.query("UPDATE payments SET status = 'valid' WHERE id = $1", [pay2]),
    ).rejects.toThrow(/cannot be restored/);
    await expect(pool.query("DELETE FROM invoices")).rejects.toThrow(
      /cannot be deleted/,
    );
    await expect(pool.query("DELETE FROM invoice_items")).rejects.toThrow(
      /cannot be deleted/,
    );
    await expect(
      pool.query("UPDATE invoice_items SET amount = 1"),
    ).rejects.toThrow(/cannot be edited/);
    await expect(
      pool.query("UPDATE invoices SET student_id = $1 WHERE id = $2", [
        S2.id,
        inv1,
      ]),
    ).rejects.toThrow(/identity/);
  });

  it("sets a discount only for an admin, never above the total or below what was paid", async () => {
    const put = (token, body) =>
      call(token, "put", `/api/fees/invoices/${inv2}/discount`, body);
    expect(
      (await put(accountantToken, { discount: "100", reason: "x" })).status,
    ).toBe(403);
    expect((await put(adminToken, { discount: "100" })).status).toBe(400);
    expect(
      (await put(adminToken, { discount: "5000", reason: "too big" })).status,
    ).toBe(400);

    const tooLow = await put(adminToken, {
      discount: "400",
      reason: "Scholarship",
    });
    expect(tooLow.status).toBe(400);
    expect(tooLow.body.error).toMatch(/less than what was already paid/);

    expect(
      (await put(adminToken, { discount: "300", reason: "Scholarship" }))
        .status,
    ).toBe(200);
    expect(await detail(inv2)).toMatchObject({
      total: 900,
      paid: 900,
      balance: 0,
      discount_reason: "Scholarship",
    });
  });

  it("cancels an invoice only for an admin, with a reason, and only without payments", async () => {
    const cancel = (token, id, body) =>
      call(token, "post", `/api/fees/invoices/${id}/cancel`, body);
    expect((await cancel(accountantToken, inv3, { reason: "x" })).status).toBe(
      403,
    );
    expect((await cancel(adminToken, inv3, {})).status).toBe(400);

    const withPayments = await cancel(adminToken, inv1, {
      reason: "Duplicate",
    });
    expect(withPayments.status).toBe(400);
    expect(withPayments.body.error).toMatch(/payments/);

    expect(
      (await cancel(adminToken, inv3, { reason: "Issued by mistake" })).status,
    ).toBe(200);
    expect(await detail(inv3)).toMatchObject({
      status: "cancelled",
      cancel_reason: "Issued by mistake",
    });
    expect((await list()).find((r) => r.id === inv3).pay_status).toBe(
      "cancelled",
    );
  });

  it("refuses payments, discounts, and a second cancellation on a cancelled invoice", async () => {
    expect((await pay(accountantToken, inv3)).body.error).toMatch(/cancelled/);
    const discount = await call(
      adminToken,
      "put",
      `/api/fees/invoices/${inv3}/discount`,
      { discount: "10", reason: "x" },
    );
    expect(discount.status).toBe(400);
    const again = await call(
      adminToken,
      "post",
      `/api/fees/invoices/${inv3}/cancel`,
      { reason: "again" },
    );
    expect(again.body.error).toMatch(/already cancelled/);
  });

  it("keeps students who have invoices from being deleted", async () => {
    const res = await call(adminToken, "delete", `/api/students/${S1.id}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/financial records/);
    const user = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE email = 's1@test.com'",
    );
    expect(user.rows[0].n).toBe(1);
  });
});

describe("what a parent can see about fees", () => {
  async function parentOf(email, student) {
    const user = await createUser("parent", email);
    const g = await pool.query(
      "INSERT INTO guardians (user_id, full_name) VALUES ($1, 'Parent') RETURNING id",
      [user.id],
    );
    await pool.query(
      "INSERT INTO student_guardians (student_id, guardian_id, relationship) VALUES ($1, $2, 'father')",
      [student.id, g.rows[0].id],
    );
    return tokenFor(user);
  }
  let p1, p2, p3;

  beforeAll(async () => {
    p1 = await parentOf("pp1@test.com", S1);
    p2 = await parentOf("pp2@test.com", S2);
    p3 = await parentOf("pp3@test.com", S3);
  });

  it("shows the invoices of a linked child with valid payments only", async () => {
    const res = await call(
      p1,
      "get",
      `/api/parent-fees/children/${S1.id}/invoices`,
    );
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("ETB");
    expect(res.body.invoices).toHaveLength(1);
    const inv = res.body.invoices[0];
    expect(inv.items).toHaveLength(2);
    expect(inv.payments.map((p) => p.amount).sort()).toEqual([500, 700]);
    expect(inv.payments.some((p) => p.id === pay2)).toBe(false);
  });

  it("hides cancelled invoices", async () => {
    const res = await call(
      p3,
      "get",
      `/api/parent-fees/children/${S3.id}/invoices`,
    );
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0]).toMatchObject({ total: 80, discount: 20 });
  });

  it("refuses the invoices of a child who is not theirs", async () => {
    expect(
      (await call(p1, "get", `/api/parent-fees/children/${S2.id}/invoices`))
        .status,
    ).toBe(403);
  });

  it("opens a receipt of their own child, without the cashier", async () => {
    const res = await call(p1, "get", `/api/parent-fees/receipts/${pay1}`);
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(500);
    expect(res.body.received_by).toBeUndefined();
  });

  it("refuses a voided receipt, another family's receipt, and an unknown one", async () => {
    expect(
      (await call(p1, "get", `/api/parent-fees/receipts/${pay2}`)).status,
    ).toBe(403);
    expect(
      (await call(p2, "get", `/api/parent-fees/receipts/${pay1}`)).status,
    ).toBe(403);
    expect(
      (await call(p1, "get", "/api/parent-fees/receipts/999999")).status,
    ).toBe(403);
    expect(
      (await call(p1, "get", "/api/parent-fees/receipts/abc")).status,
    ).toBe(400);
  });

  it("keeps the staff fee endpoints closed", async () => {
    expect((await call(p1, "get", "/api/fees/payments")).status).toBe(403);
    expect(
      (
        await call(p1, "post", `/api/fees/invoices/${inv4}/payments`, {
          amount: "10",
          method: "cash",
        })
      ).status,
    ).toBe(403);
  });
});

describe("reports", () => {
  it("adds up the same as the records", async () => {
    const res = await call(
      accountantToken,
      "get",
      `/api/fees/reports/summary?year_id=${year.id}`,
    );
    expect(res.status).toBe(200);

    const valid = await pool.query(
      "SELECT COALESCE(SUM(amount), 0)::float AS total FROM payments WHERE status = 'valid'",
    );
    expect(res.body.collected).toBeCloseTo(valid.rows[0].total);
    expect(res.body.collected + res.body.outstanding).toBeCloseTo(
      res.body.invoiced,
    );

    const active = await pool.query(
      "SELECT COUNT(*)::int AS n FROM invoices WHERE status = 'active'",
    );
    expect(res.body.invoices).toBe(active.rows[0].n);
  });

  it("leaves out cancelled invoices and voided payments", async () => {
    const res = await call(
      accountantToken,
      "get",
      `/api/fees/reports/summary?year_id=${year.id}`,
    );
    expect(res.body.invoiced).toBeCloseTo(1200 + 900 + 80);
    expect(res.body.collected).toBeCloseTo(1200 + 900);
    expect(res.body.outstanding).toBeCloseTo(80);
  });

  it("splits by grade and by method", async () => {
    const res = await call(
      accountantToken,
      "get",
      `/api/fees/reports/summary?year_id=${year.id}`,
    );
    expect(res.body.per_grade.map((g) => g.grade_no)).toEqual([1, 2, 3]);
    expect(res.body.methods.map((m) => m.method).sort()).toEqual(
      ["bank_transfer", "cash", "mobile_money"].filter(
        (m) => m !== "mobile_money",
      ),
    );
  });

  it("lists who still owes money", async () => {
    const res = await call(
      accountantToken,
      "get",
      `/api/fees/reports/summary?year_id=${year.id}`,
    );
    expect(res.body.debtors.map((d) => [d.full_name, d.balance])).toEqual([
      ["Dawit Mekonnen", 80],
    ]);
  });

  it("is closed to teachers", async () => {
    expect(
      (
        await call(
          teacherToken,
          "get",
          `/api/fees/reports/summary?year_id=${year.id}`,
        )
      ).status,
    ).toBe(403);
  });
});

describe("currency", () => {
  it("can be changed by an admin only, as a 3-letter code", async () => {
    expect(
      (
        await call(accountantToken, "put", "/api/fees/currency", {
          currency: "usd",
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(adminToken, "put", "/api/fees/currency", { currency: "US" }))
        .status,
    ).toBe(400);
    expect(
      (await call(adminToken, "put", "/api/fees/currency", { currency: "12$" }))
        .status,
    ).toBe(400);

    const res = await call(adminToken, "put", "/api/fees/currency", {
      currency: "usd",
    });
    expect(res.status).toBe(200);
    expect(res.body.currency).toBe("USD");
    expect(
      (await call(accountantToken, "get", `/api/fees/receipts/${pay1}`)).body
        .currency,
    ).toBe("USD");
  });
});

describe("accountant accounts", () => {
  let acct;

  it("are created by an admin, with a login that works", async () => {
    const res = await call(adminToken, "post", "/api/users", {
      email: "cashier@test.com",
      password: "Cashier1234",
    });
    expect(res.status).toBe(201);
    acct = res.body;
    const login = await api()
      .post("/api/auth/login")
      .send({ email: "cashier@test.com", password: "Cashier1234" });
    expect(login.body.user.role).toBe("accountant");
  });

  it("refuse a duplicate email, a weak password, and non-admins", async () => {
    expect(
      (
        await call(adminToken, "post", "/api/users", {
          email: "cashier@test.com",
          password: "Cashier1234",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(adminToken, "post", "/api/users", {
          email: "weak@test.com",
          password: "short",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(teacherToken, "post", "/api/users", {
          email: "x@test.com",
          password: "Cashier1234",
        })
      ).status,
    ).toBe(403);
  });

  it("can have their password reset", async () => {
    const res = await call(
      adminToken,
      "post",
      `/api/users/${acct.id}/password`,
      { new_password: "NewCashier99" },
    );
    expect(res.status).toBe(200);
    expect(
      (
        await api()
          .post("/api/auth/login")
          .send({ email: "cashier@test.com", password: "Cashier1234" })
      ).status,
    ).toBe(401);
    expect(
      (
        await api()
          .post("/api/auth/login")
          .send({ email: "cashier@test.com", password: "NewCashier99" })
      ).status,
    ).toBe(200);
  });

  it("cannot be used to reset or delete other kinds of users", async () => {
    const teacher = await pool.query(
      "SELECT id FROM users WHERE email = 'teacher@test.com'",
    );
    const id = teacher.rows[0].id;
    expect(
      (
        await call(adminToken, "post", `/api/users/${id}/password`, {
          new_password: "Hacked12345",
        })
      ).status,
    ).toBe(404);
    expect((await call(adminToken, "delete", `/api/users/${id}`)).status).toBe(
      404,
    );
    const still = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE id = $1",
      [id],
    );
    expect(still.rows[0].n).toBe(1);
  });

  it("can be deleted without losing the payments they recorded", async () => {
    const cashier = tokenFor({ id: acct.id, role: "accountant" });
    const paid = await pay(cashier, inv4, { amount: "10" });
    expect(paid.status).toBe(201);

    expect(
      (await call(adminToken, "delete", `/api/users/${acct.id}`)).status,
    ).toBe(200);
    const row = await pool.query(
      "SELECT amount::float AS amount, received_by FROM payments WHERE id = $1",
      [paid.body.id],
    );
    expect(row.rows).toEqual([{ amount: 10, received_by: null }]);
  });
});
