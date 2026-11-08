const pool = require('../config/db')

const SENSITIVE = ['password', 'new_password', 'current_password', 'confirm', 'password_hash']
const ACTIONS = { POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }

// Copy the body but hide passwords
function clean(value) {
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') {
    const out = {}
    for (const k of Object.keys(value)) {
      out[k] = SENSITIVE.includes(k) ? '[hidden]' : clean(value[k])
    }
    return out
  }
  return value
}

function auditMiddleware(req, res, next) {
  if (!ACTIONS[req.method]) return next()

  res.on('finish', async () => {
    try {
      const url = req.originalUrl.split('?')[0]
      const isLogin = url === '/api/auth/login'
      let action = ACTIONS[req.method]
      let userId = null
      let email = null

      if (isLogin) {
        if (res.statusCode === 429) return
        action = res.statusCode === 200 ? 'login' : 'login_failed'
        email = typeof req.body?.email === 'string' ? req.body.email.slice(0, 150) : null
      } else {
        if (res.statusCode >= 400 || !req.user) return
        userId = req.user.id
      }

      const parts = url.split('/').filter(Boolean)
      const entity = parts[1] || null
      const last = parts[parts.length - 1]
      const entityId = /^\d+$/.test(last) ? Number(last) : null

      let details = { path: url, body: isLogin ? undefined : clean(req.body) }
      if (JSON.stringify(details).length > 4000) {
        details = { path: url, note: 'body too large to store' }
      }

      await pool.query(
        `INSERT INTO audit_logs (user_id, user_email, action, entity, entity_id, details, ip)
         VALUES ($1, COALESCE($2, (SELECT email FROM users WHERE id = $1)), $3, $4, $5, $6::jsonb, $7)`,
        [userId, email, action, entity, entityId, JSON.stringify(details), req.ip]
      )
    } catch (err) {
      console.error('Audit log failed:', err.message)
    }
  })

  next()
}

module.exports = auditMiddleware
