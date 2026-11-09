const apply = require("./patch");

const REQ = "const { authenticate, authorize } = require('../middleware/auth')";
const GUARD =
  REQ + "\nconst { classYearClosed } = require('../utils/yearGuard')";
const CLOSED =
  "    if (await classYearClosed(class_id)) {\n      return res.status(403).json({ error: 'This academic year is closed. Records are read-only.' })\n    }\n";

apply([
  // server.js
  [
    "backend/src/server.js",
    "const auditRoutes = require('./routes/audit');",
    "const auditRoutes = require('./routes/audit');\nconst yearRoutes = require('./routes/years');",
  ],
  [
    "backend/src/server.js",
    "app.use('/api/audit', auditRoutes);",
    "app.use('/api/audit', auditRoutes);\napp.use('/api/years', yearRoutes);",
  ],

  // attendance: closed years are read-only, classes of the active year only
  ["backend/src/routes/attendance.js", REQ, GUARD],
  [
    "backend/src/routes/attendance.js",
    "    await client.query('BEGIN')\n    for (const r of records) {",
    CLOSED + "    await client.query('BEGIN')\n    for (const r of records) {",
  ],
  [
    "backend/src/routes/attendance.js",
    "`SELECT * FROM classes\n         ORDER BY CAST(SUBSTRING(name FROM '[0-9]+') AS INT), section`",
    "`SELECT * FROM classes\n         WHERE academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')\n         ORDER BY CAST(SUBSTRING(name FROM '[0-9]+') AS INT), section`",
  ],
  [
    "backend/src/routes/attendance.js",
    "         WHERE t.user_id = $1\n         ORDER BY c.name, c.section`",
    "         WHERE t.user_id = $1 AND c.academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')\n         ORDER BY c.name, c.section`",
  ],

  // grades: closed years are read-only
  ["backend/src/routes/grades.js", REQ, GUARD],
  [
    "backend/src/routes/grades.js",
    "    await client.query('BEGIN')\n    for (const r of valid) {",
    CLOSED + "    await client.query('BEGIN')\n    for (const r of valid) {",
  ],

  // reports: use the assessments of the class's year
  [
    "backend/src/routes/reports.js",
    "    const exams = await pool.query(\n      'SELECT id, name, max_score::float AS max_score FROM exams WHERE term = $1 ORDER BY id',\n      [term]\n    )",
    "    const exams = await pool.query(\n      `SELECT e.id, e.name, e.max_score::float AS max_score FROM exams e\n       JOIN classes c ON c.academic_year_id = e.academic_year_id\n       WHERE e.term = $1 AND c.id = $2 ORDER BY e.id`,\n      [term, class_id]\n    )",
  ],
  [
    "backend/src/routes/reports.js",
    "    const max = await pool.query('SELECT COALESCE(SUM(max_score),0)::float AS total FROM exams WHERE term = $1', [term])",
    "    const max = await pool.query(\n      `SELECT COALESCE(SUM(e.max_score),0)::float AS total FROM exams e\n       JOIN classes c ON c.academic_year_id = e.academic_year_id\n       WHERE e.term = $1 AND c.id = $2`,\n      [term, class_id]\n    )",
  ],
  [
    "backend/src/routes/reports.js",
    "       LEFT JOIN exams e ON e.term = $2",
    "       LEFT JOIN exams e ON e.term = $2 AND e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = $1)",
  ],

  // report card: assessments and attendance of the class's year
  [
    "backend/src/routes/card.js",
    "  const exams = (await pool.query(\n    'SELECT id, name, max_score::float AS max_score FROM exams WHERE term = $1 ORDER BY id',\n    [term]\n  )).rows",
    "  const exams = (await pool.query(\n    `SELECT e.id, e.name, e.max_score::float AS max_score FROM exams e\n     JOIN classes c ON c.academic_year_id = e.academic_year_id\n     WHERE e.term = $1 AND c.id = $2 ORDER BY e.id`,\n    [term, student.class_id]\n  )).rows",
  ],
  [
    "backend/src/routes/card.js",
    "     WHERE s.class_id = $1 AND e.term = $2",
    "     WHERE s.class_id = $1 AND e.term = $2\n       AND e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = $1)",
  ],
  [
    "backend/src/routes/card.js",
    "  const att = await pool.query(\n    'SELECT status, COUNT(*)::int AS n FROM attendance WHERE student_id = $1 GROUP BY status',\n    [student.id]\n  )",
    "  const att = await pool.query(\n    `SELECT a.status, COUNT(*)::int AS n FROM attendance a\n     JOIN classes c ON c.id = $2\n     JOIN academic_years y ON y.id = c.academic_year_id\n     WHERE a.student_id = $1 AND a.date BETWEEN y.start_date AND y.end_date\n     GROUP BY a.status`,\n    [student.id, student.class_id]\n  )",
  ],

  // dashboard numbers
  [
    "backend/src/routes/stats.js",
    "'SELECT COUNT(*)::int AS n FROM students WHERE ($1::int[] IS NULL OR class_id = ANY($1::int[]))',",
    "\"SELECT COUNT(*)::int AS n FROM students WHERE status = 'active' AND ($1::int[] IS NULL OR class_id = ANY($1::int[]))\",",
  ],
  [
    "backend/src/routes/stats.js",
    "      classes = (await pool.query('SELECT COUNT(*)::int AS n FROM classes')).rows[0].n",
    "      classes = (await pool.query(\"SELECT COUNT(*)::int AS n FROM classes WHERE academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')\")).rows[0].n",
  ],
  [
    "backend/src/routes/stats.js",
    "'SELECT COALESCE(SUM(max_score),0)::float AS total FROM exams WHERE term = $1',",
    "\"SELECT COALESCE(SUM(max_score),0)::float AS total FROM exams WHERE term = $1 AND academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')\",",
  ],
  [
    "backend/src/routes/stats.js",
    "WHERE e.term = $1\n",
    "WHERE e.term = $1\n         AND e.academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')\n",
  ],
  [
    "backend/src/routes/stats.js",
    "HAVING COUNT(*) = (SELECT COUNT(*) FROM exams WHERE term = $1)",
    "HAVING COUNT(*) = (SELECT COUNT(*) FROM exams WHERE term = $1 AND academic_year_id = (SELECT id FROM academic_years WHERE status = 'active'))",
  ],
  [
    "backend/src/routes/statsExtra.js",
    "WHERE ($1::int[] IS NULL OR class_id = ANY($1::int[]))",
    "WHERE status = 'active' AND ($1::int[] IS NULL OR class_id = ANY($1::int[]))",
  ],
  [
    "backend/src/routes/statsExtra.js",
    "WHERE ($1::int[] IS NULL OR s.class_id = ANY($1::int[]))",
    "WHERE s.status = 'active' AND ($1::int[] IS NULL OR s.class_id = ANY($1::int[]))",
  ],

  // student portal, assignments list, students list
  [
    "backend/src/routes/me.js",
    "       CROSS JOIN exams e",
    "       JOIN exams e ON e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = s.class_id)",
  ],
  [
    "backend/src/routes/assignments.js",
    "       ORDER BY CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT), c.section, s.name",
    "       WHERE c.academic_year_id = (SELECT id FROM academic_years WHERE status = 'active')\n       ORDER BY CAST(SUBSTRING(c.name FROM '[0-9]+') AS INT), c.section, s.name",
  ],
  [
    "backend/src/routes/students.js",
    "       WHERE s.full_name ILIKE $1",
    "       WHERE s.full_name ILIKE $1 AND s.status = 'active'",
  ],
]);
