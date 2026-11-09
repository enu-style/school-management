const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')
const { classYearClosed } = require('../utils/yearGuard')

const router = express.Router()

// Can this user work with this class? (admin: all, teacher: only assigned classes)
async function canAccessClass(user, classId) {
  if (user.role === 'admin') return true
  const r = await pool.query(
    `SELECT 1 FROM class_subjects cs
     JOIN teachers t ON cs.teacher_id = t.id
     WHERE t.user_id = $1 AND cs.class_id = $2 LIMIT 1`,
    [user.id, classId]
  )
  return r.rows.length > 0
}

// Classes the user can take attendance for
router.get('/classes', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  try {
    let result
    if (req.user.role === 'admin') {
      result = await pool.query(
        `SELECT * FROM classes
         WHERE academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')
         ORDER BY CAST(SUBSTRING(name FROM '[0-9]+') AS INT), section`
      )
    } else {
      result = await pool.query(
        `SELECT DISTINCT c.*
         FROM classes c
         JOIN class_subjects cs ON cs.class_id = c.id
         JOIN teachers t ON cs.teacher_id = t.id
         WHERE t.user_id = $1 AND c.academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')
         ORDER BY c.name, c.section`,
        [req.user.id]
      )
    }
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Students of a class with their status on a date: /api/attendance?class_id=1&date=2026-11-07
router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { class_id, date } = req.query
  if (!class_id || !date) {
    return res.status(400).json({ error: 'class_id and date are required' })
  }
  try {
    if (!(await canAccessClass(req.user, class_id))) {
      return res.status(403).json({ error: 'This class is not assigned to you' })
    }
    const result = await pool.query(
      `SELECT s.id AS student_id, s.full_name, a.status
       FROM students s
       LEFT JOIN attendance a ON a.student_id = s.id AND a.date = $2::date
       WHERE s.class_id = $1
       ORDER BY s.full_name`,
      [class_id, date]
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Save attendance for a whole class
router.post('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { class_id, date, records } = req.body
  if (!class_id || !date || !Array.isArray(records)) {
    return res.status(400).json({ error: 'class_id, date and records are required' })
  }
  const allowed = ['present', 'absent', 'late']
  if (records.some((r) => !allowed.includes(r.status))) {
    return res.status(400).json({ error: 'Invalid status' })
  }

  const client = await pool.connect()
  try {
    if (!(await canAccessClass(req.user, class_id))) {
      return res.status(403).json({ error: 'This class is not assigned to you' })
    }
    if (await classYearClosed(class_id)) {
      return res.status(403).json({ error: 'This academic year is closed. Records are read-only.' })
    }
    await client.query('BEGIN')
    for (const r of records) {
      await client.query(
        `INSERT INTO attendance (student_id, class_id, date, status)
         VALUES ($1, $2, $3::date, $4)
         ON CONFLICT (student_id, date)
         DO UPDATE SET status = EXCLUDED.status, class_id = EXCLUDED.class_id`,
        [r.student_id, class_id, date, r.status]
      )
    }
    await client.query('COMMIT')
    res.json({ message: 'Attendance saved' })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

module.exports = router
