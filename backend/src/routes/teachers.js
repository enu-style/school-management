const express = require('express')
const bcrypt = require('bcrypt')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.id, t.full_name, t.phone, u.email
       FROM teachers t LEFT JOIN users u ON t.user_id = u.id
       ORDER BY t.full_name`
    )
    res.json(result.rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/', authenticate, authorize('admin'), async (req, res) => {
  const { email, password, full_name, phone } = req.body
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: 'email, password and full_name are required' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const hash = await bcrypt.hash(password, 10)
    const user = await client.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'teacher') RETURNING id",
      [email, hash]
    )
    const teacher = await client.query(
      'INSERT INTO teachers (user_id, full_name, phone) VALUES ($1, $2, $3) RETURNING *',
      [user.rows[0].id, full_name, phone || null]
    )
    await client.query('COMMIT')
    res.status(201).json(teacher.rows[0])
  } catch (err) {
    await client.query('ROLLBACK')
    console.error(err)
    if (err.code === '23505') return res.status(400).json({ error: 'Email already registered' })
    res.status(500).json({ error: 'Server error' })
  } finally {
    client.release()
  }
})

router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  const { full_name, phone } = req.body
  try {
    const result = await pool.query(
      'UPDATE teachers SET full_name = $1, phone = $2 WHERE id = $3 RETURNING *',
      [full_name, phone || null, req.params.id]
    )
    if (result.rows.length === 0) return res.status(404).json({ error: 'Teacher not found' })
    res.json(result.rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const t = await pool.query('SELECT user_id FROM teachers WHERE id = $1', [req.params.id])
    if (t.rows.length === 0) return res.status(404).json({ error: 'Teacher not found' })
    await pool.query('DELETE FROM users WHERE id = $1', [t.rows[0].user_id])
    res.json({ message: 'Teacher deleted' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
