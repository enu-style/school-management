const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// List all assignments
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id,
              c.name AS class_name, c.section,
              s.name AS subject_name,
              t.full_name AS teacher_name
       FROM class_subjects cs
       JOIN classes c ON cs.class_id = c.id
       JOIN subjects s ON cs.subject_id = s.id
       LEFT JOIN teachers t ON cs.teacher_id = t.id
       ORDER BY CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT), c.section, s.name`
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create or update an assignment (one teacher per subject per class)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { class_id, subject_id, teacher_id } = req.body
  if (!class_id || !subject_id || !teacher_id) {
    return res.status(400).json({ error: 'class_id, subject_id and teacher_id are required' })
  }
  try {
    const result = await pool.query(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (class_id, subject_id)
       DO UPDATE SET teacher_id = EXCLUDED.teacher_id
       RETURNING *`,
      [class_id, subject_id, teacher_id]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Remove an assignment
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM class_subjects WHERE id = $1', [req.params.id])
    res.json({ message: 'Assignment deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
