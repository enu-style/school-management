import { useEffect, useState } from 'react'
import api from '../api'

export default function Assignments() {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [assignments, setAssignments] = useState([])
  const [form, setForm] = useState({ class_id: '', subject_id: '', teacher_id: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadAll = async () => {
    try {
      const [c, s, t, a] = await Promise.all([
        api.get('/classes'),
        api.get('/subjects'),
        api.get('/teachers'),
        api.get('/assignments'),
      ])
      setClasses(c.data)
      setSubjects(s.data)
      setTeachers(t.data)
      setAssignments(a.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load data')
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/assignments', form)
      setMessage('Assignment saved')
      loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save assignment')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Remove this assignment?')) return
    try {
      await api.delete(`/assignments/${id}`)
      setMessage('Assignment removed')
      loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove assignment')
    }
  }

  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="text-lg font-semibold mb-4">Teacher Assignments</h2>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded bg-slate-50">
        <select name="class_id" value={form.class_id} onChange={handleChange} className={inputClass} required>
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.section}</option>
          ))}
        </select>
        <select name="subject_id" value={form.subject_id} onChange={handleChange} className={inputClass} required>
          <option value="">Select subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select name="teacher_id" value={form.teacher_id} onChange={handleChange} className={inputClass} required>
          <option value="">Select teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>{t.full_name}</option>
          ))}
        </select>
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white py-2 rounded">
          Assign
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-slate-600">
              <th className="py-2">Class</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="py-2">{a.class_name} - {a.section}</td>
                <td>{a.subject_name}</td>
                <td>{a.teacher_name || '-'}</td>
                <td>
                  <button onClick={() => remove(a.id)} className="text-red-600 hover:underline">Remove</button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr><td colSpan="4" className="py-4 text-slate-500">No assignments yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
