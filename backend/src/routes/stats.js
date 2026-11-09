const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

function letter(p) {
  if (p >= 90) return 'A'
  if (p >= 80) return 'B'
  if (p >= 70) return 'C'
  if (p >= 60) return 'D'
  return 'F'
}

router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const term = req.query.term || 'Semester 1'
  const isAdmin = req.user.role === 'admin'
  try {
    // null = whole school (admin), array = the teacher's classes
    let classIds = null
    if (!isAdmin) {
      const r = await pool.query(
        `SELECT DISTINCT cs.class_id FROM class_subjects cs
         JOIN teachers t ON t.id = cs.teacher_id WHERE t.user_id = $1`,
        [req.user.id]
      )
      classIds = r.rows.map((x) => x.class_id)
    }
    const userId = isAdmin ? null : req.user.id

    const students = await pool.query(
      "SELECT COUNT(*)::int AS n FROM students WHERE status = 'active' AND ($1::int[] IS NULL OR class_id = ANY($1::int[]))",
      [classIds]
    )

    let teachers = null
    let subjects = null
    let classes = classIds ? classIds.length : null
    if (isAdmin) {
      teachers = (await pool.query('SELECT COUNT(*)::int AS n FROM teachers')).rows[0].n
      subjects = (await pool.query('SELECT COUNT(*)::int AS n FROM subjects')).rows[0].n
      classes = (await pool.query("SELECT COUNT(*)::int AS n FROM classes WHERE academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')")).rows[0].n
    }

    const att = await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM attendance
       WHERE date = CURRENT_DATE AND ($1::int[] IS NULL OR class_id = ANY($1::int[]))
       GROUP BY status`,
      [classIds]
    )
    const attendanceToday = { present: 0, absent: 0, late: 0 }
    att.rows.forEach((r) => { attendanceToday[r.status] = r.n })

    const perGrade = await pool.query(
      `SELECT c.name, COUNT(s.id)::int AS n
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
       WHERE ($1::int[] IS NULL OR c.id = ANY($1::int[]))
       GROUP BY c.name
       ORDER BY CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT)`,
      [classIds]
    )

    const maxRow = await pool.query(
      "SELECT COALESCE(SUM(max_score),0)::float AS total FROM exams WHERE term = $1 AND academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')",
      [term]
    )
    const totalMax = maxRow.rows[0].total

    const totals = await pool.query(
      `SELECT s.id AS student_id, g.subject_id, SUM(g.score)::float AS total
       FROM grades g
       JOIN exams e ON e.id = g.exam_id
       JOIN students s ON s.id = g.student_id
       WHERE e.term = $1
         AND e.academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')
         AND ($2::int IS NULL OR EXISTS (
           SELECT 1 FROM class_subjects cs
           JOIN teachers t ON t.id = cs.teacher_id
           WHERE cs.class_id = s.class_id AND cs.subject_id = g.subject_id AND t.user_id = $2::int))
       GROUP BY s.id, g.subject_id
       HAVING COUNT(*) = (SELECT COUNT(*) FROM exams WHERE term = $1 AND academic_year_id = (SELECT id FROM academic_years WHERE status = 'active'))`,
      [term, userId]
    )
    const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    totals.rows.forEach((r) => {
      if (totalMax > 0) distribution[letter((r.total / totalMax) * 100)] += 1
    })

    const announcements = await pool.query(
      'SELECT title, created_at FROM announcements ORDER BY created_at DESC LIMIT 3'
    )

    res.json({
      term,
      counts: { students: students.rows[0].n, teachers, classes, subjects },
      attendance_today: attendanceToday,
      per_grade: perGrade.rows,
      distribution,
      graded_entries: totals.rows.length,
      announcements: announcements.rows,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
