const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/grades', authenticate, authorize('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id AS exam_id, e.name AS exam_name, e.term, e.max_score::float AS max_score,
              sub.name AS subject_name, g.score::float AS score
       FROM students s
       JOIN class_subjects cs ON cs.class_id = s.class_id
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN exams e ON e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = s.class_id)
       LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = sub.id AND g.exam_id = e.id
       WHERE s.user_id = $1
       ORDER BY e.term, sub.name, e.id`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/attendance', authenticate, authorize('student'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT to_char(a.date, 'YYYY-MM-DD') AS date, a.status
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       WHERE s.user_id = $1
       ORDER BY a.date DESC`,
      [req.user.id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
