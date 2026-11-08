const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

router.get('/', authenticate, authorize('admin'), async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1)
  const limit = 20
  const entity = req.query.entity || null
  const action = req.query.action || null
  try {
    const rows = await pool.query(
      `SELECT id, user_email, action, entity, entity_id, details, ip, created_at
       FROM audit_logs
       WHERE ($1::text IS NULL OR entity = $1) AND ($2::text IS NULL OR action = $2)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [entity, action, limit, (page - 1) * limit]
    )
    const total = await pool.query(
      `SELECT COUNT(*)::int AS n FROM audit_logs
       WHERE ($1::text IS NULL OR entity = $1) AND ($2::text IS NULL OR action = $2)`,
      [entity, action]
    )
    res.json({ rows: rows.rows, total: total.rows[0].n, page, pages: Math.max(1, Math.ceil(total.rows[0].n / limit)) })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
