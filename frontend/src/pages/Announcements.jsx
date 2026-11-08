import { useEffect, useState } from 'react'
import api from '../api'

export default function Announcements() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ title: '', body: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const res = await api.get('/announcements')
      setItems(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load announcements')
    }
  }

  useEffect(() => { load() }, [])

  const post = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/announcements', form)
      setForm({ title: '', body: '' })
      setMessage('Announcement posted')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not post announcement')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this announcement?')) return
    try {
      await api.delete(`/announcements/${id}`)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete')
    }
  }

  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-4">Announcements</h2>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      {user.role === 'admin' && (
        <form onSubmit={post} className="space-y-3 mb-6 p-4 border rounded bg-slate-50">
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} required />
          <textarea placeholder="Message" rows="3" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className={inputClass} required />
          <button type="submit" className="bg-teal hover:bg-teal/90 text-white px-6 py-2 rounded">Post</button>
        </form>
      )}

      <div className="space-y-4">
        {items.map((a) => (
          <div key={a.id} className="border rounded p-4">
            <div className="flex justify-between items-start">
              <h3 className="font-semibold">{a.title}</h3>
              {user.role === 'admin' && (
                <button onClick={() => remove(a.id)} className="text-red-600 hover:underline text-sm">Delete</button>
              )}
            </div>
            <p className="text-slate-700 mt-1 whitespace-pre-line">{a.body}</p>
            <p className="text-xs text-slate-400 mt-2">{new Date(a.created_at).toLocaleString()}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-slate-500">No announcements yet.</p>}
      </div>
    </div>
  )
}
