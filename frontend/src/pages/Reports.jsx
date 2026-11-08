import { useEffect, useState } from 'react'
import api from '../api'

function letter(p) {
  if (p >= 90) return 'A'
  if (p >= 80) return 'B'
  if (p >= 70) return 'C'
  if (p >= 60) return 'D'
  return 'F'
}

export default function Reports() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [term, setTerm] = useState('Semester 1')
  const [report, setReport] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/attendance/classes').then((r) => setClasses(r.data)).catch(() => setError('Could not load classes'))
  }, [])

  useEffect(() => {
    setSubjectId('')
    setSubjects([])
    setReport(null)
    setSummary(null)
    if (!classId) return
    api.get('/grades/subjects', { params: { class_id: classId } })
      .then((r) => setSubjects(r.data))
      .catch(() => setError('Could not load subjects'))
  }, [classId])

  useEffect(() => {
    setReport(null)
    setError('')
    if (!classId || !subjectId || subjectId === 'all') return
    api.get('/reports/subject', { params: { class_id: classId, subject_id: subjectId, term } })
      .then((r) => setReport(r.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load report'))
  }, [classId, subjectId, term])

  useEffect(() => {
    setSummary(null)
    if (!classId || subjectId !== 'all') return
    api.get('/reports/summary', { params: { class_id: classId, term } })
      .then((r) => setSummary(r.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load summary'))
  }, [classId, subjectId, term])

  const inputClass = 'border border-slate-300 rounded px-3 py-2'

  const totalMax = report ? report.exams.reduce((a, x) => a + x.max_score, 0) : 0

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Reports</h2>
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <div className="flex flex-wrap gap-4 mb-6">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
          <option value="">Select class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.section}</option>)}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass} disabled={!classId}>
          <option value="">Select subject</option>
          {user.role === 'admin' && <option value="all">All subjects (class summary)</option>}
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={term} onChange={(e) => setTerm(e.target.value)} className={inputClass}>
          <option>Semester 1</option>
          <option>Semester 2</option>
        </select>
        {(report || summary) && (
          <button onClick={() => window.print()} className="bg-slate-700 text-white px-4 py-2 rounded">Print</button>
        )}
      </div>

      {report && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-slate-600">
              <th className="py-2">Student</th>
              {report.exams.map((x) => <th key={x.id}>{x.name} <span className="text-xs">/{x.max_score}</span></th>)}
              <th>Total /{totalMax}</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {report.students.map((s) => {
              const total = report.exams.reduce((a, x) => a + (s.scores[x.id] ?? 0), 0)
              const complete = report.exams.every((x) => s.scores[x.id] !== undefined)
              return (
                <tr key={s.student_id} className="border-b">
                  <td className="py-2">{s.full_name}</td>
                  {report.exams.map((x) => <td key={x.id}>{s.scores[x.id] ?? '-'}</td>)}
                  <td className="font-semibold">{total}</td>
                  <td className="font-bold">{complete ? letter((total / totalMax) * 100) : <span className="text-xs font-normal text-slate-400">Incomplete</span>}</td>
                </tr>
              )
            })}
            {report.students.length === 0 && <tr><td className="py-4 text-slate-500">No students in this class.</td></tr>}
          </tbody>
        </table>
      )}

      {summary && (
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-slate-600">
              <th className="py-2">Student</th>
              {summary.subjects.map((s) => <th key={s.id}>{s.name} <span className="text-xs">/{summary.max_total}</span></th>)}
              <th>Average</th>
              <th>Grade</th>
            </tr>
          </thead>
          <tbody>
            {summary.students.map((st) => {
              const vals = summary.subjects.map((s) => st.totals[s.id] ?? 0)
              const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
              const pct = summary.max_total ? (avg / summary.max_total) * 100 : 0
              return (
                <tr key={st.student_id} className="border-b">
                  <td className="py-2">{st.full_name}</td>
                  {vals.map((v, i) => <td key={i}>{v}</td>)}
                  <td className="font-semibold">{avg.toFixed(1)}</td>
                  <td className="font-bold">{letter(pct)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
