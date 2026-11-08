import { useEffect, useState } from 'react'
import api from '../api'

export default function Subjects() {
  const [subjects, setSubjects] = useState([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const res = await api.get('/subjects')
      setSubjects(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load subjects')
    }
  }

  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/subjects', { name })
      setName('')
      setMessage('Subject added')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add subject')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this subject?')) return
    try {
      await api.delete(`/subjects/${id}`)
      setMessage('Subject deleted')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete subject')
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-4">Subjects</h2>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <form onSubmit={add} className="flex gap-3 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Subject name (e.g. Chemistry)"
          className="border border-slate-300 rounded px-3 py-2 w-full max-w-xs"
          required
        />
        <button type="submit" className="bg-navy hover:bg-navy-light text-white px-4 py-2 rounded">
          + Add
        </button>
      </form>

      <ul className="divide-y">
        {subjects.map((s) => (
          <li key={s.id} className="py-2 flex justify-between">
            <span>{s.name}</span>
            <button onClick={() => remove(s.id)} className="text-red-600 hover:underline">Delete</button>
          </li>
        ))}
        {subjects.length === 0 && <li className="py-2 text-slate-500">No subjects yet.</li>}
      </ul>
    </div>
  )
}
