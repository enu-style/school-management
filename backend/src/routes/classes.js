const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

// List all classes
router.get('/', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  try {
   const result = await pool.query(
     "SELECT * FROM classes ORDER BY CAST(SUBSTRING(name FROM '[0-9]+') AS INT), section",
   );
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Create a class (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { name, section, academic_year } = req.body
  if (!name || !section || !academic_year) {
    return res.status(400).json({ error: 'name, section and academic_year are required' })
  }
  try {
    const result = await pool.query(
      'INSERT INTO classes (name, section, academic_year) VALUES ($1, $2, $3) RETURNING *',
      [name, section, academic_year]
    )
    res.status(201).json(result.rows[0])
  } catch (err) {
    console.error(err)
    if (err.code === '23505') return res.status(400).json({ error: 'Class already exists' })
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
