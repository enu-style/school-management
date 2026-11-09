const express = require('express')
const pool = require('../config/db')
const { authenticate, authorize } = require('../middleware/auth')

const router = express.Router()

const PASS_MARK = 50

function letter(p) {
  if (p >= 90) return 'A'
  if (p >= 80) return 'B'
  if (p >= 70) return 'C'
  if (p >= 60) return 'D'
  return 'F'
}

async function buildCard(studentId, term) {
  const st = await pool.query(
    `SELECT s.id, s.full_name, s.class_id, c.name AS class_name, c.section, c.academic_year
     FROM students s LEFT JOIN classes c ON c.id = s.class_id
     WHERE s.id = $1`,
    [studentId]
  )
  if (st.rows.length === 0) return null
  const student = st.rows[0]
  if (!student.class_id) return { student, term, noClass: true }

  const exams = (await pool.query(
    `SELECT e.id, e.name, e.max_score::float AS max_score FROM exams e
     JOIN classes c ON c.academic_year_id = e.academic_year_id
     WHERE e.term = $1 AND c.id = $2 ORDER BY e.id`,
    [term, student.class_id]
  )).rows
  const subjects = (await pool.query(
    `SELECT DISTINCT sub.id, sub.name FROM class_subjects cs
     JOIN subjects sub ON sub.id = cs.subject_id
     WHERE cs.class_id = $1 ORDER BY sub.name`,
    [student.class_id]
  )).rows
  const classmates = (await pool.query('SELECT id FROM students WHERE class_id = $1', [student.class_id])).rows
  const grades = (await pool.query(
    `SELECT g.student_id, g.subject_id, g.exam_id, g.score::float AS score
     FROM grades g
     JOIN students s ON s.id = g.student_id
     JOIN exams e ON e.id = g.exam_id
     WHERE s.class_id = $1 AND e.term = $2
       AND e.academic_year_id = (SELECT academic_year_id FROM classes WHERE id = $1)`,
    [student.class_id, term]
  )).rows

  // score[studentId][subjectId][examId]
  const score = {}
  grades.forEach((g) => {
    score[g.student_id] = score[g.student_id] || {}
    score[g.student_id][g.subject_id] = score[g.student_id][g.subject_id] || {}
    score[g.student_id][g.subject_id][g.exam_id] = g.score
  })

  const totalMax = exams.reduce((a, x) => a + x.max_score, 0)

  const averageOf = (sid) => {
    if (subjects.length === 0) return 0
    let sum = 0
    subjects.forEach((sub) => {
      exams.forEach((x) => { sum += score[sid]?.[sub.id]?.[x.id] ?? 0 })
    })
    return sum / subjects.length
  }

  const myAverage = averageOf(student.id)
  const rank = 1 + classmates.filter((m) => averageOf(m.id) > myAverage).length

  const rows = subjects.map((sub) => {
    const scores = {}
    let total = 0
    let complete = true
    exams.forEach((x) => {
      const v = score[student.id]?.[sub.id]?.[x.id]
      scores[x.id] = v ?? null
      if (v === undefined) complete = false
      total += v ?? 0
    })
    const percent = totalMax ? (total / totalMax) * 100 : 0
    return { subject: sub.name, scores, total, grade: complete ? letter(percent) : null, complete }
  })

  const complete = rows.length > 0 && exams.length > 0 && rows.every((r) => r.complete)
  const percent = totalMax ? (myAverage / totalMax) * 100 : 0
  let status = 'Incomplete'
  if (complete) status = percent >= PASS_MARK ? 'Promoted' : 'Repeat'

  const att = await pool.query(
    `SELECT a.status, COUNT(*)::int AS n FROM attendance a
     JOIN classes c ON c.id = $2
     JOIN academic_years y ON y.id = c.academic_year_id
     WHERE a.student_id = $1 AND a.date BETWEEN y.start_date AND y.end_date
     GROUP BY a.status`,
    [student.id, student.class_id]
  )
  const attendance = { present: 0, absent: 0, late: 0 }
  att.rows.forEach((r) => { attendance[r.status] = r.n })

  return {
    student,
    term,
    exams,
    totalMax,
    subjects: rows,
    average: Number(myAverage.toFixed(1)),
    percent: Number(percent.toFixed(1)),
    grade: complete ? letter(percent) : null,
    rank,
    class_size: classmates.length,
    complete,
    status,
    attendance,
  }
}

// Staff: one student's card
router.get('/student', authenticate, authorize('admin', 'teacher'), async (req, res) => {
  const { student_id, term } = req.query
  if (!student_id || !term) return res.status(400).json({ error: 'student_id and term are required' })
  try {
    if (req.user.role === 'teacher') {
      const ok = await pool.query(
        `SELECT 1 FROM students s
         JOIN class_subjects cs ON cs.class_id = s.class_id
         JOIN teachers t ON t.id = cs.teacher_id
         WHERE s.id = $1 AND t.user_id = $2 LIMIT 1`,
        [student_id, req.user.id]
      )
      if (ok.rows.length === 0) return res.status(403).json({ error: 'This student is not in your classes' })
    }
    const card = await buildCard(student_id, term)
    if (!card) return res.status(404).json({ error: 'Student not found' })
    res.json(card)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Student: own card (id comes from the token, never from the URL)
router.get('/me', authenticate, authorize('student'), async (req, res) => {
  const term = req.query.term
  if (!term) return res.status(400).json({ error: 'term is required' })
  try {
    const me = await pool.query('SELECT id FROM students WHERE user_id = $1', [req.user.id])
    if (me.rows.length === 0) return res.status(404).json({ error: 'Student profile not found' })
    res.json(await buildCard(me.rows[0].id, term))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
