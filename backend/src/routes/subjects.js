const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects ORDER BY name')
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name } = req.body
  if (!name) return res.status(400).json({ error: 'name is required' })
  try {
    const result = await pool.query('INSERT INTO subjects (name) VALUES ($1) RETURNING *', [name])
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    if (err.code === '23505') return res.status(400).json({ error: 'Subject already exists' })
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM subjects WHERE id = $1', [req.params.id])
    res.json({ message: 'Subject deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
