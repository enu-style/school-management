const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

const isId = (v) => /^\d+$/.test(String(v));
const LETTER = /^[A-Z]$/;
const letters = (n) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

function fail(message, status = 400) {
  const err = new Error(message);
  err.user = true;
  err.status = status;
  throw err;
}

function handle(res, err) {
  if (err.user) return res.status(err.status).json({ error: err.message });
  if (err.code === "23505")
    return res.status(400).json({ error: "That section already exists" });
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

// Locks the year row so two changes cannot run together, and refuses a closed year
async function lockOpenYear(client, yearId) {
  const y = await client.query(
    "SELECT id, name, status FROM academic_years WHERE id = $1::int FOR UPDATE",
    [yearId],
  );
  if (!y.rows[0]) fail("Academic year not found");
  if (y.rows[0].status === "closed")
    fail("This academic year is closed. Sections are read-only.");
  return y.rows[0];
}

// A section with students, enrollment history, or attendance is never removed
async function inUse(client, classId) {
  const r = await client.query(
    `SELECT (SELECT COUNT(*) FROM students WHERE class_id = $1::int)
          + (SELECT COUNT(*) FROM student_enrollments WHERE class_id = $1::int)
          + (SELECT COUNT(*) FROM attendance WHERE class_id = $1::int) AS n`,
    [classId],
  );
  return Number(r.rows[0].n) > 0;
}

function readCapacity(v) {
  if (v === undefined || v === null || String(v).trim() === "")
    return { value: null };
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 200)
    return {
      error:
        "Capacity must be a whole number from 1 to 200, or empty for no limit",
    };
  return { value: n };
}

async function copySubjects(client, yearId, grade, excludeIds, toIds) {
  if (toIds.length === 0) return;
  const src = await client.query(
    `SELECT c.id FROM classes c
     WHERE c.academic_year_id = $1::int AND c.name = $2 AND c.id <> ALL($3::int[])
       AND EXISTS (SELECT 1 FROM class_subjects cs WHERE cs.class_id = c.id)
     ORDER BY c.section LIMIT 1`,
    [yearId, `Grade ${grade}`, excludeIds],
  );
  if (!src.rows[0]) return;
  for (const id of toIds) {
    await client.query(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id)
       SELECT $2::int, subject_id, teacher_id FROM class_subjects WHERE class_id = $1::int`,
      [src.rows[0].id, id],
    );
  }
}

// Classes of one year (default: the active year), with student counts
router.get(
  "/",
  authenticate,
  authorize("admin", "teacher"),
  async (req, res) => {
    try {
      const yearId = isId(req.query.year_id)
        ? Number(req.query.year_id)
        : await activeYearId();
      const r = await pool.query(
        `SELECT c.*, (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id AND s.status = 'active') AS student_count
       FROM classes c WHERE c.academic_year_id = $1::int
       ORDER BY CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT), c.section`,
        [yearId],
      );
      res.json(r.rows);
    } catch (err) {
      handle(res, err);
    }
  },
);

// Grades 1 to 12 with their sections, students, and capacity
router.get("/overview", authenticate, authorize("admin"), async (req, res) => {
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
    const year = years.find((y) => y.id === yearId) || null;
    const rows = yearId
      ? (
          await pool.query(
            `SELECT c.id, c.section, c.capacity, CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT) AS grade_no,
                  (SELECT COUNT(*)::int FROM students s WHERE s.class_id = c.id AND s.status = 'active') AS students,
                  (SELECT COUNT(*)::int FROM class_subjects cs WHERE cs.class_id = c.id) AS subjects
           FROM classes c WHERE c.academic_year_id = $1::int ORDER BY grade_no, c.section`,
            [yearId],
          )
        ).rows
      : [];
    const grades = Array.from({ length: 12 }, (_, i) => ({
      grade_no: i + 1,
      sections: rows.filter((r) => r.grade_no === i + 1),
    }));
    res.json({
      years,
      year,
      grades,
      totals: {
        sections: rows.length,
        students: rows.reduce((a, r) => a + r.students, 0),
      },
    });
  } catch (err) {
    handle(res, err);
  }
});

// Set how many sections a grade has: A to the chosen count
router.put(
  "/grade-sections",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    const g = Number(req.body.grade_no);
    const n = Number(req.body.count);
    if (!isId(req.body.year_id) || !Number.isInteger(g) || g < 1 || g > 12) {
      return res
        .status(400)
        .json({ error: "Choose a year and a grade from 1 to 12" });
    }
    if (!Number.isInteger(n) || n < 0 || n > 26)
      return res.status(400).json({ error: "Use 0 to 26 sections" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const year = await lockOpenYear(client, req.body.year_id);
      const name = `Grade ${g}`;
      const existing = (
        await client.query(
          "SELECT id, section FROM classes WHERE academic_year_id = $1::int AND name = $2",
          [year.id, name],
        )
      ).rows;

      const wanted = letters(n);
      const have = new Set(existing.map((c) => c.section));
      const remove = existing.filter(
        (c) => LETTER.test(c.section) && !wanted.includes(c.section),
      );
      const add = wanted.filter((s) => !have.has(s));

      const blocked = [];
      for (const c of remove)
        if (await inUse(client, c.id)) blocked.push(`${name} - ${c.section}`);
      if (blocked.length) {
        fail(
          `Cannot remove ${blocked.join(", ")}: they have students, enrollment history, or attendance records. Move the students first.`,
        );
      }

      if (remove.length) {
        await client.query("DELETE FROM classes WHERE id = ANY($1::int[])", [
          remove.map((c) => c.id),
        ]);
      }

      const created = [];
      for (const s of add) {
        const r = await client.query(
          "INSERT INTO classes (name, section, academic_year, academic_year_id) VALUES ($1, $2, $3, $4) RETURNING id",
          [name, s, year.name, year.id],
        );
        created.push(r.rows[0].id);
      }
      if (req.body.copy_subjects)
        await copySubjects(client, year.id, g, created, created);

      await client.query("COMMIT");
      res.json({ added: add, removed: remove.map((c) => c.section).sort() });
    } catch (err) {
      await client.query("ROLLBACK");
      handle(res, err);
    } finally {
      client.release();
    }
  },
);

// One capacity for every section of a grade
router.put("/capacity", authenticate, authorize("admin"), async (req, res) => {
  const g = Number(req.body.grade_no);
  const cap = readCapacity(req.body.capacity);
  if (!isId(req.body.year_id) || !Number.isInteger(g) || g < 1 || g > 12) {
    return res
      .status(400)
      .json({ error: "Choose a year and a grade from 1 to 12" });
  }
  if (cap.error) return res.status(400).json({ error: cap.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await lockOpenYear(client, req.body.year_id);
    const r = await client.query(
      "UPDATE classes SET capacity = $1 WHERE academic_year_id = $2::int AND name = $3",
      [cap.value, req.body.year_id, `Grade ${g}`],
    );
    await client.query("COMMIT");
    res.json({ updated: r.rowCount });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// Add one section (grade_no, or the older name such as "Grade 9")
router.post("/", authenticate, authorize("admin"), async (req, res) => {
  let g = Number(req.body.grade_no);
  if (!Number.isInteger(g) && typeof req.body.name === "string")
    g = parseInt(req.body.name.replace(/\D/g, ""), 10);
  const section = String(req.body.section ?? "").trim();
  const cap = readCapacity(req.body.capacity);
  if (!Number.isInteger(g) || g < 1 || g > 12)
    return res.status(400).json({ error: "Choose a grade from 1 to 12" });
  if (!section || section.length > 10)
    return res
      .status(400)
      .json({ error: "Enter a section name (up to 10 characters)" });
  if (cap.error) return res.status(400).json({ error: cap.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const yearId = isId(req.body.year_id)
      ? Number(req.body.year_id)
      : await activeYearId();
    if (!yearId) fail("There is no active academic year");
    const year = await lockOpenYear(client, yearId);
    const r = await client.query(
      `INSERT INTO classes (name, section, academic_year, academic_year_id, capacity)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, section, capacity`,
      [`Grade ${g}`, section, year.name, year.id, cap.value],
    );
    if (req.body.copy_subjects)
      await copySubjects(client, year.id, g, [r.rows[0].id], [r.rows[0].id]);
    await client.query("COMMIT");
    res.status(201).json(r.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

// Change the capacity of one section
router.put("/:id", authenticate, authorize("admin"), async (req, res) => {
  const cap = readCapacity(req.body.capacity);
  if (cap.error) return res.status(400).json({ error: cap.error });
  try {
    const c = await pool.query(
      "SELECT y.status FROM classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = $1::int",
      [req.params.id],
    );
    if (!c.rows[0]) return res.status(404).json({ error: "Section not found" });
    if (c.rows[0].status === "closed")
      return res
        .status(400)
        .json({
          error: "This academic year is closed. Sections are read-only.",
        });
    await pool.query("UPDATE classes SET capacity = $1 WHERE id = $2::int", [
      cap.value,
      req.params.id,
    ]);
    res.json({ message: "Capacity saved" });
  } catch (err) {
    handle(res, err);
  }
});

// Remove one empty section (its subject assignments and lessons go with it)
router.delete("/:id", authenticate, authorize("admin"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query(
      "SELECT name, section, academic_year_id FROM classes WHERE id = $1::int",
      [req.params.id],
    );
    if (!c.rows[0]) fail("Section not found", 404);
    await lockOpenYear(client, c.rows[0].academic_year_id);
    if (await inUse(client, req.params.id)) {
      fail(
        `${c.rows[0].name} - ${c.rows[0].section} has students, enrollment history, or attendance records and cannot be removed`,
      );
    }
    await client.query("DELETE FROM classes WHERE id = $1::int", [
      req.params.id,
    ]);
    await client.query("COMMIT");
    res.json({ message: "Section removed" });
  } catch (err) {
    await client.query("ROLLBACK");
    handle(res, err);
  } finally {
    client.release();
  }
});

module.exports = router;
