import { useEffect, useState } from 'react'
import api from '../api'

const empty = { name: '', term: 'Semester 1', max_score: '' }

export default function Exams() {
  const [exams, setExams] = useState([])
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const res = await api.get('/exams')
      setExams(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load assessments')
    }
  }

  useEffect(() => { load() }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const add = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/exams', form)
      setForm(empty)
      setMessage('Assessment added')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add assessment')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this assessment? All its grades will be deleted too.')) return
    try {
      await api.delete(`/exams/${id}`)
      setMessage('Assessment deleted')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete assessment')
    }
  }

  const terms = [...new Set(exams.map((x) => x.term))]
  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="text-lg font-semibold mb-4">Assessments (Exams and Assignments)</h2>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <form onSubmit={add} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 border rounded bg-slate-50">
        <input name="name" placeholder="e.g. Quiz 1" value={form.name} onChange={handleChange} className={inputClass} required />
        <select name="term" value={form.term} onChange={handleChange} className={inputClass}>
          <option>Semester 1</option>
          <option>Semester 2</option>
        </select>
        <input name="max_score" type="number" min="1" max="100" step="0.5" placeholder="Max marks" value={form.max_score} onChange={handleChange} className={inputClass} required />
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white py-2 rounded">+ Add</button>
      </form>

      {terms.map((term) => {
        const rows = exams.filter((x) => x.term === term)
        const total = rows.reduce((a, r) => a + r.max_score, 0)
        return (
          <div key={term} className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold">{term}</h3>
              <span className={`text-sm px-2 py-1 rounded ${total === 100 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                Total: {total} / 100 {total !== 100 && '(should be 100)'}
              </span>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="py-2">Assessment</th>
                  <th>Max marks</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.id} className="border-b">
                    <td className="py-2">{x.name}</td>
                    <td>{x.max_score}</td>
                    <td><button onClick={() => remove(x.id)} className="text-red-600 hover:underline">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
      {exams.length === 0 && <p className="text-slate-500">No assessments yet.</p>}
    </div>
  )
}
