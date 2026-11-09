const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

const isDate = (d) =>
  typeof d === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(d) &&
  !isNaN(Date.parse(d));
const DECISIONS = ["promote", "repeat", "graduate", "skip"];
const gradeNumber = (name) => parseInt(String(name).replace(/\D/g, ""), 10);

// Stops a transaction with a message that is safe to show the user
function fail(message) {
  const err = new Error(message);
  err.user = true;
  throw err;
}

// The active year (any logged-in user, used by the header)
router.get("/active", authenticate, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date
       FROM academic_years WHERE status = 'active'`,
    );
    res.json(r.rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// All years with semesters and counts
router.get("/", authenticate, authorize("admin"), async (req, res) => {
  try {
    const years = await pool.query(
      `SELECT y.id, y.name, y.status,
              to_char(y.start_date, 'YYYY-MM-DD') AS start_date,
              to_char(y.end_date, 'YYYY-MM-DD') AS end_date,
              (SELECT COUNT(*)::int FROM classes c WHERE c.academic_year_id = y.id) AS classes,
              (SELECT COUNT(*)::int FROM student_enrollments e WHERE e.academic_year_id = y.id) AS students
       FROM academic_years y ORDER BY y.start_date DESC`,
    );
    const sems = await pool.query(
      `SELECT id, academic_year_id, name,
              to_char(start_date, 'YYYY-MM-DD') AS start_date,
              to_char(end_date, 'YYYY-MM-DD') AS end_date
       FROM semesters ORDER BY name`,
    );
    res.json(
      years.rows.map((y) => ({
        ...y,
        semesters: sems.rows.filter((s) => s.academic_year_id === y.id),
      })),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// A student's enrollment history
router.get(
  "/history/:studentId",
  authenticate,
  authorize("admin", "teacher"),
  async (req, res) => {
    if (!/^\d+$/.test(req.params.studentId))
      return res.status(400).json({ error: "Invalid student" });
    try {
      if (req.user.role === "teacher") {
        const ok = await pool.query(
          `SELECT 1 FROM students s
         JOIN class_subjects cs ON cs.class_id = s.class_id
         JOIN teachers t ON t.id = cs.teacher_id
         WHERE s.id = $1 AND t.user_id = $2 LIMIT 1`,
          [req.params.studentId, req.user.id],
        );
        if (ok.rows.length === 0)
          return res
            .status(403)
            .json({ error: "This student is not in your classes" });
      }
      const r = await pool.query(
        `SELECT y.name AS year, c.name AS class_name, c.section, en.status
       FROM student_enrollments en
       JOIN academic_years y ON y.id = en.academic_year_id
       LEFT JOIN classes c ON c.id = en.class_id
       WHERE en.student_id = $1
       ORDER BY y.start_date DESC`,
        [req.params.studentId],
      );
      res.json(r.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Promotion preview: results and a suggested decision for each student
router.get(
  "/promotion/preview",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    const { from_year, to_year, grade } = req.query;
    const pass =
      req.query.pass_mark === undefined || req.query.pass_mark === ""
        ? 50
        : Number(req.query.pass_mark);
    if (!from_year || !to_year || from_year === to_year) {
      return res
        .status(400)
        .json({ error: "Choose two different academic years" });
    }
    if (isNaN(pass) || pass < 0 || pass > 100) {
      return res.status(400).json({ error: "Pass mark must be from 0 to 100" });
    }
    try {
      const students = await pool.query(
        `SELECT en.student_id, s.full_name, c.id AS class_id, c.name AS class_name, c.section
       FROM student_enrollments en
       JOIN students s ON s.id = en.student_id AND s.status = 'active'
       JOIN classes c ON c.id = en.class_id
       WHERE en.academic_year_id = $1::int AND en.status = 'enrolled'
         AND ($2::text IS NULL OR c.name = $2::text)
       ORDER BY CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT), c.section, s.full_name`,
        [from_year, grade || null],
      );
      const exams = (
        await pool.query(
          `SELECT COUNT(*)::int AS n, COALESCE(SUM(max_score), 0)::float AS total
       FROM exams WHERE academic_year_id = $1::int`,
          [from_year],
        )
      ).rows[0];
      const subjects = await pool.query(
        "SELECT class_id, COUNT(*)::int AS n FROM class_subjects GROUP BY class_id",
      );
      const grades = await pool.query(
        `SELECT g.student_id, SUM(g.score)::float AS score, COUNT(*)::int AS n
       FROM grades g JOIN exams e ON e.id = g.exam_id
       WHERE e.academic_year_id = $1::int
       GROUP BY g.student_id`,
        [from_year],
      );
      const targets = await pool.query(
        "SELECT id, name, section FROM classes WHERE academic_year_id = $1::int",
        [to_year],
      );

      const subjectCount = {};
      subjects.rows.forEach((r) => {
        subjectCount[r.class_id] = r.n;
      });
      const gradeOf = {};
      grades.rows.forEach((r) => {
        gradeOf[r.student_id] = r;
      });
      const classOf = {};
      targets.rows.forEach((c) => {
        classOf[`${c.name}|${c.section}`] = c;
      });
      const label = (c) => (c ? `${c.name} - ${c.section}` : null);

      const rows = students.rows.map((s) => {
        const subjectsN = subjectCount[s.class_id] || 0;
        const expected = subjectsN * exams.n;
        const g = gradeOf[s.student_id];
        const complete = expected > 0 && !!g && g.n === expected;
        const percent =
          complete && exams.total
            ? (g.score / (subjectsN * exams.total)) * 100
            : null;
        const no = gradeNumber(s.class_name);

        let suggestion = "review";
        if (complete)
          suggestion =
            percent >= pass ? (no >= 12 ? "graduate" : "promote") : "repeat";

        return {
          student_id: s.student_id,
          full_name: s.full_name,
          class_name: `${s.class_name} - ${s.section}`,
          percent: percent === null ? null : Number(percent.toFixed(1)),
          complete,
          suggestion,
          promote_to:
            no < 12 ? label(classOf[`Grade ${no + 1}|${s.section}`]) : null,
          repeat_to: label(classOf[`${s.class_name}|${s.section}`]),
        };
      });
      res.json({ pass_mark: pass, rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Apply promotion decisions in one transaction
router.post(
  "/promotion/apply",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    const { from_year, to_year, decisions } = req.body;
    if (
      !from_year ||
      !to_year ||
      from_year === to_year ||
      !Array.isArray(decisions)
    ) {
      return res
        .status(400)
        .json({ error: "from_year, to_year and decisions are required" });
    }
    if (decisions.some((d) => !DECISIONS.includes(d.decision))) {
      return res.status(400).json({ error: "Invalid decision" });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const to = await client.query(
        "SELECT status FROM academic_years WHERE id = $1::int",
        [to_year],
      );
      if (to.rows.length === 0) fail("The new academic year was not found");
      if (to.rows[0].status === "closed")
        fail("The new academic year is closed");

      const classes = await client.query(
        "SELECT id, name, section FROM classes WHERE academic_year_id = $1::int",
        [to_year],
      );
      const byKey = {};
      classes.rows.forEach((c) => {
        byKey[`${c.name}|${c.section}`] = c;
      });

      let processed = 0;
      for (const d of decisions) {
        if (d.decision === "skip") continue;

        const en = await client.query(
          `SELECT en.id, c.name, c.section
         FROM student_enrollments en JOIN classes c ON c.id = en.class_id
         WHERE en.student_id = $1::int AND en.academic_year_id = $2::int AND en.status = 'enrolled'`,
          [d.student_id, from_year],
        );
        if (en.rows.length === 0) continue;
        const { id: enrollmentId, name, section } = en.rows[0];
        const no = gradeNumber(name);

        if (d.decision === "graduate") {
          if (no < 12) fail("Only Grade 12 students can graduate");
          await client.query(
            "UPDATE student_enrollments SET status = 'graduated' WHERE id = $1",
            [enrollmentId],
          );
          await client.query(
            "UPDATE students SET status = 'graduated', class_id = NULL WHERE id = $1::int",
            [d.student_id],
          );
        } else {
          let target;
          if (d.decision === "promote") {
            if (no >= 12)
              fail("Grade 12 students graduate instead of being promoted");
            target = byKey[`Grade ${no + 1}|${section}`];
          } else {
            target = byKey[`${name}|${section}`];
          }
          if (!target) {
            const wanted = d.decision === "promote" ? `Grade ${no + 1}` : name;
            fail(
              `The new year has no ${wanted} - ${section} class. Create or copy the classes first.`,
            );
          }
          const status = d.decision === "promote" ? "promoted" : "repeated";
          await client.query(
            "UPDATE student_enrollments SET status = $1 WHERE id = $2",
            [status, enrollmentId],
          );
          // The database trigger creates the enrollment in the new year
          await client.query(
            "UPDATE students SET class_id = $1 WHERE id = $2::int",
            [target.id, d.student_id],
          );
        }
        processed++;
      }

      await client.query("COMMIT");
      res.json({ processed });
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.user) return res.status(400).json({ error: err.message });
      console.error(err);
      res.status(500).json({ error: "Server error" });
    } finally {
      client.release();
    }
  },
);

// Create a year (optionally copying classes, teacher assignments and assessments)
router.post("/", authenticate, authorize("admin"), async (req, res) => {
  const { name, start_date, end_date, copy_from } = req.body;
  const m = /^(\d{4})\/(\d{4})$/.exec(name || "");
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    return res.status(400).json({ error: "The name must look like 2027/2028" });
  }
  if (!isDate(start_date) || !isDate(end_date) || end_date <= start_date) {
    return res
      .status(400)
      .json({ error: "Enter valid dates. The end must be after the start." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const y = await client.query(
      "INSERT INTO academic_years (name, start_date, end_date) VALUES ($1, $2, $3) RETURNING id",
      [name, start_date, end_date],
    );
    const id = y.rows[0].id;

    await client.query(
      `INSERT INTO semesters (academic_year_id, name, start_date, end_date)
       VALUES ($1::int, 'Semester 1', $2::date, ($2::date + INTERVAL '5 months' - INTERVAL '1 day')::date),
              ($1::int, 'Semester 2', ($2::date + INTERVAL '5 months')::date, $3::date)`,
      [id, start_date, end_date],
    );

    if (copy_from) {
      await client.query(
        `INSERT INTO classes (name, section, academic_year, academic_year_id)
         SELECT name, section, $1::varchar, $2::int FROM classes WHERE academic_year_id = $3::int`,
        [name, id, copy_from],
      );
      await client.query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id)
         SELECT nc.id, cs.subject_id, cs.teacher_id
         FROM class_subjects cs
         JOIN classes oc ON oc.id = cs.class_id AND oc.academic_year_id = $1::int
         JOIN classes nc ON nc.name = oc.name AND nc.section = oc.section AND nc.academic_year_id = $2::int`,
        [copy_from, id],
      );
      await client.query(
        `INSERT INTO exams (name, term, max_score, academic_year_id)
         SELECT name, term, max_score, $1::int FROM exams WHERE academic_year_id = $2::int`,
        [id, copy_from],
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505")
      return res
        .status(400)
        .json({ error: "That academic year already exists" });
    if (err.code === "23514")
      return res
        .status(400)
        .json({ error: "The year must be longer than 5 months" });
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// Edit dates of a year and its semesters
router.put("/:id", authenticate, authorize("admin"), async (req, res) => {
  const { start_date, end_date, semesters } = req.body;
  if (!isDate(start_date) || !isDate(end_date) || end_date <= start_date) {
    return res
      .status(400)
      .json({ error: "Enter valid dates. The end must be after the start." });
  }
  const list = Array.isArray(semesters) ? semesters : [];
  if (
    list.some(
      (s) =>
        !isDate(s.start_date) ||
        !isDate(s.end_date) ||
        s.end_date <= s.start_date,
    )
  ) {
    return res
      .status(400)
      .json({
        error: "Each semester needs valid dates, with the end after the start",
      });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      "UPDATE academic_years SET start_date = $1, end_date = $2 WHERE id = $3 RETURNING id",
      [start_date, end_date, req.params.id],
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Academic year not found" });
    }
    for (const s of list) {
      await client.query(
        "UPDATE semesters SET start_date = $1, end_date = $2 WHERE id = $3 AND academic_year_id = $4",
        [s.start_date, s.end_date, s.id, req.params.id],
      );
    }
    await client.query("COMMIT");
    res.json({ message: "Academic year updated" });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// Make a year the active one (the previous active year is closed)
router.post(
  "/:id/activate",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE academic_years SET status = 'closed' WHERE status = 'active' AND id <> $1",
        [req.params.id],
      );
      const r = await client.query(
        "UPDATE academic_years SET status = 'active' WHERE id = $1 RETURNING id",
        [req.params.id],
      );
      if (r.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Academic year not found" });
      }
      await client.query("COMMIT");
      res.json({ message: "Academic year activated" });
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(err);
      res.status(500).json({ error: "Server error" });
    } finally {
      client.release();
    }
  },
);

// Close the active year without choosing a successor
router.post(
  "/:id/close",
  authenticate,
  authorize("admin"),
  async (req, res) => {
    try {
      const r = await pool.query(
        "UPDATE academic_years SET status = 'closed' WHERE id = $1 AND status = 'active' RETURNING id",
        [req.params.id],
      );
      if (r.rows.length === 0)
        return res
          .status(400)
          .json({ error: "Only the active year can be closed" });
      res.json({ message: "Academic year closed" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
