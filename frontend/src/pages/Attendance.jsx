import { useEffect, useState } from 'react'
import api from '../api'

const today = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD

export default function Attendance() {
  const [classes, setClasses] = useState([])
  const [classId, setClassId] = useState('')
  const [date, setDate] = useState(today)
  const [students, setStudents] = useState([])
  const [statuses, setStatuses] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    api.get('/attendance/classes')
      .then((res) => setClasses(res.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load classes'))
  }, [])

  useEffect(() => {
    if (!classId || !date) return
    setError('')
    setMessage('')
    api.get('/attendance', { params: { class_id: classId, date } })
      .then((res) => {
        setStudents(res.data)
        const map = {}
        res.data.forEach((s) => { map[s.student_id] = s.status || 'present' })
        setStatuses(map)
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load students'))
  }, [classId, date])

  const setStatus = (id, status) => setStatuses({ ...statuses, [id]: status })

  const markAll = (status) => {
    const map = {}
    students.forEach((s) => { map[s.student_id] = status })
    setStatuses(map)
  }

  const save = async () => {
    setError('')
    setMessage('')
    try {
      const records = students.map((s) => ({ student_id: s.student_id, status: statuses[s.student_id] }))
      await api.post('/attendance', { class_id: classId, date, records })
      setMessage('Attendance saved')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save attendance')
    }
  }

  const count = (status) => Object.values(statuses).filter((v) => v === status).length

  const btn = (id, status, label, active) => (
    <button
      type="button"
      onClick={() => setStatus(id, status)}
      className={`px-3 py-1 rounded border ${statuses[id] === status ? active : 'bg-white text-slate-600 hover:bg-slate-100'}`}
    >
      {label}
    </button>
  )

  const inputClass = 'border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="text-lg font-semibold mb-4">Attendance</h2>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <div className="flex flex-wrap gap-4 mb-6">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
          ))}
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
      </div>

      {classes.length === 0 && !error && (
        <p className="text-slate-500">No classes available. Ask the admin to assign you to a class.</p>
      )}

      {classId && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button onClick={() => markAll('present')} className="text-blue-600 hover:underline">Mark all present</button>
            <span className="text-sm text-slate-600">
              Present: {count('present')} | Absent: {count('absent')} | Late: {count('late')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="py-2">Student</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id} className="border-b">
                    <td className="py-2">{s.full_name}</td>
                    <td className="space-x-2 py-2">
                      {btn(s.student_id, 'present', 'Present', 'bg-green-600 text-white border-green-600')}
                      {btn(s.student_id, 'absent', 'Absent', 'bg-red-600 text-white border-red-600')}
                      {btn(s.student_id, 'late', 'Late', 'bg-yellow-500 text-white border-yellow-500')}
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr><td colSpan="2" className="py-4 text-slate-500">No students in this class.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {students.length > 0 && (
            <button onClick={save} className="mt-6 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded">
              Save Attendance
            </button>
          )}
        </>
      )}
    </div>
  )
}
