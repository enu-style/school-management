const express = require("express");
const pool = require("../config/db");
const { authenticate, authorize } = require("../middleware/auth");
const { buildCard } = require("./card");

const router = express.Router();

router.use(authenticate, authorize("parent"));

// Every child route passes through this check: the child must be linked to this parent
async function linked(req, res, next) {
  const id = req.params.studentId;
  if (!/^\d+$/.test(id))
    return res.status(400).json({ error: "Invalid student" });
  try {
    const r = await pool.query(
      `SELECT 1 FROM student_guardians sg
       JOIN guardians g ON g.id = sg.guardian_id
       WHERE g.user_id = $1 AND sg.student_id = $2`,
      [req.user.id, id],
    );
    if (r.rows.length === 0) {
      return res
        .status(403)
        .json({ error: "This student is not linked to your account" });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
}

// My children, with this year's attendance counts
router.get("/children", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT s.id, s.full_name, s.gender, s.status, c.name AS class_name, c.section, sg.relationship,
         (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = s.id AND a.status = 'present'
            AND a.date BETWEEN (SELECT start_date FROM academic_years WHERE status = 'active')
                           AND (SELECT end_date FROM academic_years WHERE status = 'active')) AS present,
         (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = s.id AND a.status = 'absent'
            AND a.date BETWEEN (SELECT start_date FROM academic_years WHERE status = 'active')
                           AND (SELECT end_date FROM academic_years WHERE status = 'active')) AS absent,
         (SELECT COUNT(*)::int FROM attendance a WHERE a.student_id = s.id AND a.status = 'late'
            AND a.date BETWEEN (SELECT start_date FROM academic_years WHERE status = 'active')
                           AND (SELECT end_date FROM academic_years WHERE status = 'active')) AS late
       FROM guardians g
       JOIN student_guardians sg ON sg.guardian_id = g.id
       JOIN students s ON s.id = sg.student_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE g.user_id = $1
       ORDER BY s.full_name`,
      [req.user.id],
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/children/:studentId/grades", linked, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT e.id AS exam_id, e.name AS exam_name, e.term, e.max_score::float AS max_score,
              sub.name AS subject_name, g.score::float AS score
       FROM students s
       JOIN class_subjects cs ON cs.class_id = s.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN exams e ON e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = s.class_id)
       LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = sub.id AND g.exam_id = e.id
       WHERE s.id = $1
       ORDER BY e.term, sub.name, e.id`,
      [req.params.studentId],
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/children/:studentId/attendance", linked, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT to_char(date, 'YYYY-MM-DD') AS date, status
       FROM attendance WHERE student_id = $1
       ORDER BY date DESC LIMIT 365`,
      [req.params.studentId],
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/children/:studentId/card", linked, async (req, res) => {
  const term = req.query.term;
  if (!term) return res.status(400).json({ error: "term is required" });
  try {
    const card = await buildCard(req.params.studentId, term);
    if (!card) return res.status(404).json({ error: "Student not found" });
    res.json(card);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
