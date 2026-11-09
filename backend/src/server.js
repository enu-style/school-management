const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
require('dotenv').config();
const pool = require('./config/db');
const { validateLogin, validateNewUser, validateRegister } = require('./middleware/validate');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const classRoutes = require('./routes/classes');
const subjectRoutes = require('./routes/subjects');
const teacherRoutes = require('./routes/teachers');
const assignmentRoutes = require('./routes/assignments');
const attendanceRoutes = require('./routes/attendance');
const examRoutes = require('./routes/exams');
const gradeRoutes = require('./routes/grades');
const meRoutes = require('./routes/me');
const reportRoutes = require('./routes/reports');
const announcementRoutes = require('./routes/announcements');
const passwordRoutes = require('./routes/password');
const cardRoutes = require('./routes/card');
const statsRoutes = require('./routes/stats');
const statsExtraRoutes = require('./routes/statsExtra');
const auditRoutes = require('./routes/audit');
const yearRoutes = require('./routes/years');
const timetableRoutes = require('./routes/timetable');
const feeRoutes = require('./routes/fees');
const parentFeeRoutes = require('./routes/parentFees');
const userRoutes = require('./routes/users');
const guardianRoutes = require('./routes/guardians');
const parentRoutes = require('./routes/parent');
const auditMiddleware = require('./middleware/audit');

// Refuse to start with a missing or weak JWT secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short (use at least 16 characters). Check your .env file.');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
].filter(Boolean);
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '10kb' }));
app.use('/api', auditMiddleware);

// General limit: 300 requests per 15 minutes per IP
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
}));

// Login limit: 5 wrong attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed login attempts. Try again in 15 minutes.' },
});

// Validation runs before the routes
app.post('/api/auth/login', loginLimiter, validateLogin);
app.post('/api/auth/register', validateRegister);
app.post('/api/students', validateNewUser);
app.post('/api/teachers', validateNewUser);
app.post('/api/users', validateNewUser);
app.post('/api/guardians', validateNewUser);

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/assignments', assignmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/me', meRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/card', cardRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/stats-extra', statsExtraRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/years', yearRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/parent-fees', parentFeeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/guardians', guardianRoutes);
app.use('/api/parent', parentRoutes);

app.get('/', (req, res) => {
  res.send('School Management API is running');
});

app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Database connected', time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Unknown URL
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Broken JSON and other unexpected errors
app.use((err, req, res, next) => {
  console.error(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  res.status(500).json({ error: 'Server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
