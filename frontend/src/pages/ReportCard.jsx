import { useEffect, useState } from 'react'
import api from '../api'

export default function ReportCard() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isStudent = user.role === 'student'
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [classId, setClassId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [term, setTerm] = useState('Semester 1')
  const [card, setCard] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isStudent) return
    api.get('/attendance/classes').then((r) => setClasses(r.data)).catch(() => setError('Could not load classes'))
    api.get('/students').then((r) => setStudents(r.data)).catch(() => setError('Could not load students'))
  }, [])

  useEffect(() => { setStudentId('') }, [classId])

  useEffect(() => {
    setCard(null)
    setError('')
    if (isStudent) {
      api.get('/card/me', { params: { term } })
        .then((r) => setCard(r.data))
        .catch((err) => setError(err.response?.data?.error || 'Could not load report card'))
    } else if (studentId) {
      api.get('/card/student', { params: { student_id: studentId, term } })
        .then((r) => setCard(r.data))
        .catch((err) => setError(err.response?.data?.error || 'Could not load report card'))
    }
  }, [studentId, term])

  const classStudents = students.filter((s) => String(s.class_id) === String(classId))
  const inputClass = 'border border-slate-300 rounded px-3 py-2'
  const statusColor = {
    Promoted: 'text-green-700',
    Repeat: 'text-red-700',
    Incomplete: 'text-yellow-700',
  }

  return (
    <div>
      <div className="print:hidden bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
        <h2 className="text-lg font-semibold mb-4">Report Card</h2>
        {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}
        <div className="flex flex-wrap gap-4">
          {!isStudent && (
            <>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
                <option value="">Select class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.section}</option>)}
              </select>
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className={inputClass} disabled={!classId}>
                <option value="">Select student</option>
                {classStudents.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </>
          )}
          <select value={term} onChange={(e) => setTerm(e.target.value)} className={inputClass}>
            <option>Semester 1</option>
            <option>Semester 2</option>
          </select>
          {card && !card.noClass && (
            <button onClick={() => window.print()} className="bg-slate-700 text-white px-4 py-2 rounded">
              Print / Save as PDF
            </button>
          )}
        </div>
      </div>

      {card && card.noClass && (
        <p className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-slate-500">This student is not in a class yet.</p>
      )}

      {card && !card.noClass && (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
          <div className="text-center border-b pb-4 mb-4">
            <h1 className="text-2xl font-bold">School Management</h1>
            <p className="text-slate-600">Student Report Card - {card.term}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-6 text-sm">
            <p><b>Name:</b> {card.student.full_name}</p>
            <p><b>Class:</b> {card.student.class_name} - {card.student.section}</p>
            <p><b>Academic year:</b> {card.student.academic_year}</p>
            <p><b>Date:</b> {new Date().toLocaleDateString()}</p>
          </div>

          <table className="w-full text-left mb-6">
            <thead>
              <tr className="border-b-2 text-slate-700">
                <th className="py-2">Subject</th>
                {card.exams.map((x) => <th key={x.id}>{x.name} <span className="text-xs">/{x.max_score}</span></th>)}
                <th>Total /{card.totalMax}</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {card.subjects.map((r) => (
                <tr key={r.subject} className="border-b">
                  <td className="py-2 font-medium">{r.subject}</td>
                  {card.exams.map((x) => <td key={x.id}>{r.scores[x.id] ?? '-'}</td>)}
                  <td className="font-semibold">{r.total}</td>
                  <td className="font-bold">{r.grade || <span className="text-xs font-normal text-slate-400">Incomplete</span>}</td>
                </tr>
              ))}
              {card.subjects.length === 0 && (
                <tr><td colSpan="10" className="py-4 text-slate-500">No subjects are assigned to this class yet.</td></tr>
              )}
            </tbody>
          </table>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 text-center">
            <div className="border rounded p-3"><p className="text-xs text-slate-500">Average</p><p className="text-xl font-bold">{card.average} / {card.totalMax}</p></div>
            <div className="border rounded p-3"><p className="text-xs text-slate-500">Overall grade</p><p className="text-xl font-bold">{card.grade || '-'}</p></div>
            <div className="border rounded p-3"><p className="text-xs text-slate-500">Rank</p><p className="text-xl font-bold">{card.rank} of {card.class_size}</p></div>
            <div className="border rounded p-3"><p className="text-xs text-slate-500">Status</p><p className={`text-xl font-bold ${statusColor[card.status]}`}>{card.status}</p></div>
          </div>

          <p className="text-sm mb-10">
            <b>Attendance:</b> Present {card.attendance.present} | Absent {card.attendance.absent} | Late {card.attendance.late}
          </p>

          <div className="grid grid-cols-3 gap-8 text-center text-sm text-slate-600 mt-12">
            <div className="border-t pt-2">Class teacher</div>
            <div className="border-t pt-2">Principal</div>
            <div className="border-t pt-2">Parent / Guardian</div>
          </div>
        </div>
      )}
    </div>
  )
}
