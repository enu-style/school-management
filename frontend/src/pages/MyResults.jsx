import { useEffect, useState } from 'react'
import api from '../api'

function letter(percent) {
  if (percent >= 90) return 'A'
  if (percent >= 80) return 'B'
  if (percent >= 70) return 'C'
  if (percent >= 60) return 'D'
  return 'F'
}

export default function MyResults() {
  const [rows, setRows] = useState([])
  const [attendance, setAttendance] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/me/grades').then((r) => setRows(r.data)).catch(() => setError('Could not load grades'))
    api.get('/me/attendance').then((r) => setAttendance(r.data)).catch(() => setError('Could not load attendance'))
  }, [])

  const terms = [...new Set(rows.map((r) => r.term))]
  const count = (s) => attendance.filter((a) => a.status === s).length
  const badge = {
    present: 'bg-green-100 text-green-700',
    absent: 'bg-red-100 text-red-700',
    late: 'bg-yellow-100 text-yellow-700',
  }

  return (
    <div className="space-y-6">
      {error && <p className="bg-red-100 text-red-700 p-3 rounded">{error}</p>}

      {terms.length === 0 && (
        <div className="bg-white p-6 rounded shadow text-slate-500">No grades yet.</div>
      )}

      {terms.map((term) => {
        const termRows = rows.filter((r) => r.term === term)
        const assessments = []
        termRows.forEach((r) => {
          if (!assessments.find((a) => a.exam_id === r.exam_id)) {
            assessments.push({ exam_id: r.exam_id, name: r.exam_name, max: r.max_score })
          }
        })
        const subjects = [...new Set(termRows.map((r) => r.subject_name))]
        const totalMax = assessments.reduce((a, x) => a + x.max, 0)

        return (
          <div key={term} className="bg-white p-6 rounded shadow overflow-x-auto">
            <h2 className="text-lg font-semibold mb-4">{term}</h2>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="py-2">Subject</th>
                  {assessments.map((a) => (
                    <th key={a.exam_id}>{a.name} <span className="text-xs">/{a.max}</span></th>
                  ))}
                  <th>Total /{totalMax}</th>
                  <th>Grade</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((sub) => {
                  const subRows = termRows.filter((r) => r.subject_name === sub)
                  const total = subRows.reduce((a, r) => a + (r.score ?? 0), 0)
                  const percent = totalMax ? (total / totalMax) * 100 : 0
                  const complete = subRows.every((r) => r.score !== null)
                  return (
                    <tr key={sub} className="border-b">
                      <td className="py-2 font-medium">{sub}</td>
                      {assessments.map((a) => {
                        const cell = subRows.find((r) => r.exam_id === a.exam_id)
                        return <td key={a.exam_id}>{cell && cell.score !== null ? cell.score : '-'}</td>
                      })}
                      <td className="font-semibold">{total}</td>
                      <td>
                        {complete ? (
                          <span className="font-bold">{letter(percent)}</span>
                        ) : (
                          <span className="text-xs text-slate-400">Incomplete</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-lg font-semibold mb-2">My Attendance</h2>
        <p className="text-sm text-slate-600 mb-4">
          Present: {count('present')} | Absent: {count('absent')} | Late: {count('late')}
        </p>
        <div className="flex flex-wrap gap-2">
          {attendance.map((a) => (
            <span key={a.date} className={`px-3 py-1 rounded text-sm ${badge[a.status]}`}>
              {a.date}: {a.status}
            </span>
          ))}
          {attendance.length === 0 && <p className="text-slate-500">No attendance records yet.</p>}
        </div>
      </div>
    </div>
  )
}
