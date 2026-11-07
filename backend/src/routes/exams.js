const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, term, max_score::float AS max_score
       FROM exams ORDER BY term, id`
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, term, max_score } = req.body
  if (!name || !term || !max_score) {
    return res.status(400).json({ error: 'name, term and max_score are required' })
  }
  if (Number(max_score) <= 0 || Number(max_score) > 100) {
    return res.status(400).json({ error: 'max_score must be between 1 and 100' })
  }
  try {
    const result = await pool.query(
      'INSERT INTO exams (name, term, max_score) VALUES ($1, $2, $3) RETURNING *',
      [name, term, Number(max_score)]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM exams WHERE id = $1', [req.params.id])
    res.json({ message: 'Assessment deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
