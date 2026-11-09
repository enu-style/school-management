const express = require('express')
const bcrypt = require('bcrypt')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

function validPassword(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72
}

// Any logged-in user changes their own password
router.post('/change', authenticate, async (req, res) => {
  const { current_password, new_password } = req.body
  if (typeof current_password !== 'string' || !validPassword(new_password)) {
    return res.status(400).json({ error: 'New password must be 8 to 72 characters' })
  }
  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' })

    const match = await bcrypt.compare(current_password, result.rows[0].password_hash)
    if (!match) return res.status(401).json({ error: 'Current password is incorrect' })

    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id])
    res.json({ message: 'Password changed successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Admin resets a student's or teacher's password
router.post('/reset', authenticate, authorize('admin'), async (req, res) => {
  const { type, id, new_password } = req.body
  const tables = { student: 'students', teacher: 'teachers', guardian: 'guardians' }
  if (!tables[type] || !id) {
    return res.status(400).json({ error: 'type (student or teacher) and id are required' })
  }
  if (!validPassword(new_password)) {
    return res.status(400).json({ error: 'New password must be 8 to 72 characters' })
  }
  try {
    const person = await pool.query(`SELECT user_id FROM ${tables[type]} WHERE id = $1`, [id])
    if (person.rows.length === 0) return res.status(404).json({ error: 'Person not found' })

    const hash = await bcrypt.hash(new_password, 10)
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, person.rows[0].user_id])
    res.json({ message: 'Password reset successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
