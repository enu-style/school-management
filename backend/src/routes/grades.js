const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')
const { classYearClosed } = require('../utils/yearGuard')

const router = express.Router()

async function canGrade(user, classId, subjectId) {
  if (user.role === 'admin') return true
  const r = await pool.query(
    `SELECT 1 FROM class_subjects cs
     JOIN teachers t ON cs.teacher_id = t.id
     WHERE t.user_id = $1 AND cs.class_id = $2 AND cs.subject_id = $3`,
    [user.id, classId, subjectId]
  )
  return r.rows.length > 0
}

router.get('/subjects', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { class_id } = req.query
  if (!class_id) return res.status(400).json({ error: 'class_id is required' })
  try {
    let result
    if (req.user.role === 'admin') {
      result = await pool.query(
        `SELECT DISTINCT s.id, s.name FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         WHERE cs.class_id = $1 ORDER BY s.name`,
        [class_id]
      )
    } else {
      result = await pool.query(
        `SELECT DISTINCT s.id, s.name FROM class_subjects cs
         JOIN subjects s ON cs.subject_id = s.id
         JOIN teachers t ON cs.teacher_id = t.id
         WHERE cs.class_id = $1 AND t.user_id = $2 ORDER BY s.name`,
        [class_id, req.user.id]
      )
    }
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { class_id, subject_id, exam_id } = req.query
  if (!class_id || !subject_id || !exam_id) {
    return res.status(400).json({ error: 'class_id, subject_id and exam_id are required' })
  }
  try {
    if (!(await canGrade(req.user, class_id, subject_id))) {
      return res.status(403).json({ error: 'This subject is not assigned to you' })
    }
    const result = await pool.query(
      `SELECT s.id AS student_id, s.full_name, g.score::float AS score
       FROM students s
       LEFT JOIN grades g ON g.student_id = s.id AND g.subject_id = $2 AND g.exam_id = $3
       WHERE s.class_id = $1
       ORDER BY s.full_name`,
      [class_id, subject_id, exam_id]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { class_id, subject_id, exam_id, records } = req.body
  if (!class_id || !subject_id || !exam_id || !Array.isArray(records)) {
    return res.status(400).json({ error: 'class_id, subject_id, exam_id and records are required' })
  }

  const client = await pool.connect()
  try {
    const exam = await pool.query('SELECT max_score::float AS max_score FROM exams WHERE id = $1', [exam_id])
    if (exam.rows.length === 0) return res.status(404).json({ error: 'Assessment not found' })
    const max = exam.rows[0].max_score

    const valid = records.filter((r) => r.score !== '' && r.score !== null && r.score !== undefined)
    if (valid.some((r) => isNaN(Number(r.score)) || Number(r.score) < 0 || Number(r.score) > max)) {
      return res.status(400).json({ error: `Scores must be numbers from 0 to ${max}` })
    }

    if (!(await canGrade(req.user, class_id, subject_id))) {
      return res.status(403).json({ error: 'This subject is not assigned to you' })
    }

    if (await classYearClosed(class_id)) {
      return res.status(403).json({ error: 'This academic year is closed. Records are read-only.' })
    }
    const ids = valid.map((r) => r.student_id)
    if (ids.some((v) => !/^\d+$/.test(String(v)))) {
      return res.status(400).json({ error: 'Invalid student in the list' })
    }
    const own = await pool.query(
      'SELECT COUNT(*)::int AS n FROM students WHERE class_id = $1::int AND id = ANY($2::int[])',
      [class_id, ids]
    )
    if (own.rows[0].n !== new Set(ids.map(String)).size) {
      return res.status(400).json({ error: 'Some students are not in this class' })
    }
    await client.query('BEGIN')
    for (const r of valid) {
      await client.query(
        `INSERT INTO grades (student_id, subject_id, exam_id, score)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, subject_id, exam_id)
         DO UPDATE SET score = EXCLUDED.score`,
        [r.student_id, subject_id, exam_id, Number(r.score)]
      )
    }
    await client.query('COMMIT')
    res.json({ message: 'Grades saved' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

module.exports = router
