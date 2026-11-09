const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

async function canView(user, classId, subjectId) {
  if (user.role === 'admin') return true
  const r = await pool.query(
    `SELECT 1 FROM class_subjects cs
     JOIN teachers t ON cs.teacher_id = t.id
     WHERE t.user_id = $1 AND cs.class_id = $2 AND cs.subject_id = $3`,
    [user.id, classId, subjectId]
  )
  return r.rows.length > 0
}

// One subject: every student with every assessment score
router.get('/subject', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { class_id, subject_id, term } = req.query
  if (!class_id || !subject_id || !term) {
    return res.status(400).json({ error: 'class_id, subject_id and term are required' })
  }
  try {
    if (!(await canView(req.user, class_id, subject_id))) {
      return res.status(403).json({ error: 'This subject is not assigned to you' })
    }
    const exams = await pool.query(
      `SELECT e.id, e.name, e.max_score::float AS max_score FROM exams e
       JOIN classes c ON c.academic_year_id = e.academic_year_id
       WHERE e.term = $1 AND c.id = $2 ORDER BY e.id`,
      [term, class_id]
    )
    const students = await pool.query(
      'SELECT id AS student_id, full_name FROM students WHERE class_id = $1 ORDER BY full_name',
      [class_id]
    )
    const grades = await pool.query(
      `SELECT g.student_id, g.exam_id, g.score::float AS score
       FROM grades g JOIN students s ON g.student_id = s.id
       WHERE s.class_id = $1 AND g.subject_id = $2`,
      [class_id, subject_id]
    )
    const rows = students.rows.map((s) => {
      const scores = {}
      grades.rows.filter((g) => g.student_id === s.student_id).forEach((g) => { scores[g.exam_id] = g.score })
      return { ...s, scores }
    })
    res.json({ exams: exams.rows, students: rows })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Whole class: total per subject for each student (admin only)
router.get('/summary', authenticate, authorize('admin'), async (req, res) => {
  const { class_id, term } = req.query
  if (!class_id || !term) return res.status(400).json({ error: 'class_id and term are required' })
  try {
    const max = await pool.query(
      `SELECT COALESCE(SUM(e.max_score),0)::float AS total FROM exams e
       JOIN classes c ON c.academic_year_id = e.academic_year_id
       WHERE e.term = $1 AND c.id = $2`,
      [term, class_id]
    )
    const subjects = await pool.query(
      `SELECT DISTINCT sub.id, sub.name FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       WHERE cs.class_id = $1 ORDER BY sub.name`,
      [class_id]
    )
    const totals = await pool.query(
      `SELECT s.id AS student_id, s.full_name, sub.id AS subject_id,
              COALESCE(SUM(g.score), 0)::float AS total
       FROM students s
       JOIN class_subjects cs ON cs.class_id = s.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN exams e ON e.term = $2 AND e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = $1)
       LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = sub.id AND g.exam_id = e.id
       WHERE s.class_id = $1
       GROUP BY s.id, s.full_name, sub.id`,
      [class_id, term]
    )
    const map = {}
    totals.rows.forEach((r) => {
      if (!map[r.student_id]) map[r.student_id] = { student_id: r.student_id, full_name: r.full_name, totals: {} }
      map[r.student_id].totals[r.subject_id] = r.total
    })
    res.json({
      max_total: max.rows[0].total,
      subjects: subjects.rows,
      students: Object.values(map).sort((a, b) => a.full_name.localeCompare(b.full_name)),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
