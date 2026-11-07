import { useEffect, useState } from 'react'
import api from '../api'

const gradeColors = { A: '#16a34a', B: '#2563eb', C: '#ca8a04', D: '#ea580c', F: '#dc2626' }

function StatCard({ label, value }) {
  return (
    <div className="bg-white p-5 rounded shadow text-center">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  )
}

function Bar({ label, value, max, color }) {
  const width = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="w-20 text-sm text-slate-600">{label}</span>
      <div className="flex-1 bg-slate-100 rounded h-5">
        <div className="h-5 rounded" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="w-10 text-sm text-right">{value}</span>
    </div>
  )
}

export default function Overview() {
  const [term, setTerm] = useState('Semester 1')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    api.get('/stats', { params: { term } })
      .then((r) => setData(r.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load dashboard'))
  }, [term])

  if (error) return <p className="bg-red-100 text-red-700 p-3 rounded">{error}</p>
  if (!data) return <p className="text-slate-500">Loading...</p>

  const att = data.attendance_today
  const marked = att.present + att.absent + att.late
  const rate = marked ? Math.round(((att.present + att.late) / marked) * 100) : null
  const maxPerGrade = Math.max(1, ...data.per_grade.map((g) => g.n))
  const maxDist = Math.max(1, ...Object.values(data.distribution))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Students" value={data.counts.students} />
        {data.counts.teachers !== null && <StatCard label="Teachers" value={data.counts.teachers} />}
        <StatCard label="Classes" value={data.counts.classes} />
        {data.counts.subjects !== null && <StatCard label="Subjects" value={data.counts.subjects} />}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-semibold mb-4">Today's Attendance</h2>
          {marked === 0 ? (
            <p className="text-slate-500">No attendance has been taken today.</p>
          ) : (
            <>
              <p className="text-4xl font-bold mb-4">{rate}%</p>
              <Bar label="Present" value={att.present} max={marked} color="#16a34a" />
              <Bar label="Late" value={att.late} max={marked} color="#eab308" />
              <Bar label="Absent" value={att.absent} max={marked} color="#dc2626" />
            </>
          )}
        </div>

        <div className="bg-white p-6 rounded shadow">
          <h2 className="font-semibold mb-4">Students per Grade</h2>
          {data.per_grade.map((g) => (
            <Bar key={g.name} label={g.name} value={g.n} max={maxPerGrade} color="#2563eb" />
          ))}
          {data.per_grade.length === 0 && <p className="text-slate-500">No classes yet.</p>}
        </div>
      </div>

      <div className="bg-white p-6 rounded shadow">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold">Grade Distribution (subject results)</h2>
          <select value={term} onChange={(e) => setTerm(e.target.value)} className="border border-slate-300 rounded px-3 py-1">
            <option>Semester 1</option>
            <option>Semester 2</option>
          </select>
        </div>
        {data.graded_entries === 0 ? (
          <p className="text-slate-500">No fully graded subjects yet. Enter all assessments in Grades.</p>
        ) : (
          Object.entries(data.distribution).map(([g, n]) => (
            <Bar key={g} label={`Grade ${g}`} value={n} max={maxDist} color={gradeColors[g]} />
          ))
        )}
      </div>

      <div className="bg-white p-6 rounded shadow">
        <h2 className="font-semibold mb-3">Latest Announcements</h2>
        {data.announcements.map((a, i) => (
          <p key={i} className="text-sm border-b py-2">
            {a.title} <span className="text-slate-400">({new Date(a.created_at).toLocaleDateString()})</span>
          </p>
        ))}
        {data.announcements.length === 0 && <p className="text-slate-500">No announcements yet.</p>}
      </div>
    </div>
  )
}
