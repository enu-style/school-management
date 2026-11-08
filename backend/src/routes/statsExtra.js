const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const isAdmin = req.user.role === 'admin'
  try {
    let classIds = null
    if (!isAdmin) {
      const r = await pool.query(
        `SELECT DISTINCT cs.class_id FROM class_subjects cs
         JOIN teachers t ON t.id = cs.teacher_id WHERE t.user_id = $1`,
        [req.user.id]
      )
      classIds = r.rows.map((x) => x.class_id)
    }

    const gender = await pool.query(
      `SELECT COALESCE(gender, 'unknown') AS gender, COUNT(*)::int AS n
       FROM students
       WHERE ($1::int[] IS NULL OR class_id = ANY($1::int[]))
       GROUP BY 1`,
      [classIds]
    )

    const recent = await pool.query(
      `SELECT s.full_name, c.name AS class_name, c.section, u.created_at
       FROM students s
       LEFT JOIN classes c ON c.id = s.class_id
       LEFT JOIN users u ON u.id = s.user_id
       WHERE ($1::int[] IS NULL OR s.class_id = ANY($1::int[]))
       ORDER BY u.created_at DESC NULLS LAST
       LIMIT 5`,
      [classIds]
    )

    let activity = []
    if (isAdmin) {
      activity = (await pool.query(
        `SELECT user_email, action, entity, created_at
         FROM audit_logs ORDER BY created_at DESC LIMIT 6`
      )).rows
    }

    res.json({ gender: gender.rows, recent_students: recent.rows, activity })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
