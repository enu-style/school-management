const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const allowedRoles = ['admin', 'teacher', 'student']

function validateLogin(req, res, next) {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'email and password are required' })
  }
  next()
}

// bcrypt only uses the first 72 bytes, so we cap the length at 72
function validateNewUser(req, res, next) {
  const { email, password } = req.body || {}
  if (typeof email !== 'string' || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Enter a valid email address' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: 'Password must be 8 to 72 characters' })
  }
  next()
}

function validateRegister(req, res, next) {
  const { role } = req.body || {}
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Role must be admin, teacher or student' })
  }
  validateNewUser(req, res, next)
}

module.exports = { validateLogin, validateNewUser, validateRegister }
