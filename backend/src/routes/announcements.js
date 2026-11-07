const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// Everyone logged in can read
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.title, a.body, a.created_at, u.email AS author
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       ORDER BY a.created_at DESC`
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin only
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { title, body } = req.body
  if (!title || !body) return res.status(400).json({ error: 'title and body are required' })
  try {
    const result = await pool.query(
      'INSERT INTO announcements (title, body, created_by) VALUES ($1, $2, $3) RETURNING *',
      [title, body, req.user.id]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM announcements WHERE id = $1', [req.params.id])
    res.json({ message: 'Announcement deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
