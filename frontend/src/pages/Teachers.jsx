import { useEffect, useState } from 'react'
import api from '../api'

const emptyForm = { full_name: '', email: '', password: '', phone: '' }

export default function Teachers() {
  const [teachers, setTeachers] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      const res = await api.get('/teachers')
      setTeachers(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load teachers')
    }
  }

  useEffect(() => { load() }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const openEdit = (t) => {
    setEditingId(t.id)
    setForm({ ...emptyForm, full_name: t.full_name, phone: t.phone || '' })
    setShowForm(true)
    setError('')
    setMessage('')
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      if (editingId) {
        await api.put(`/teachers/${editingId}`, { full_name: form.full_name, phone: form.phone })
        setMessage('Teacher updated')
      } else {
        await api.post('/teachers', form)
        setMessage('Teacher added')
      }
      closeForm()
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save teacher')
    }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this teacher and their login account?')) return
    try {
      await api.delete(`/teachers/${id}`)
      setMessage('Teacher deleted')
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete teacher')
    }
  }

  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Teachers</h2>
        <button
          onClick={showForm ? closeForm : () => setShowForm(true)}
          className="bg-navy hover:bg-navy-light text-white px-4 py-2 rounded"
        >
          {showForm ? 'Cancel' : '+ Add Teacher'}
        </button>
      </div>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      {showForm && (
        <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded bg-slate-50">
          <input name="full_name" placeholder="Full name" value={form.full_name} onChange={handleChange} className={inputClass} required />
          <input name="phone" placeholder="Phone" value={form.phone} onChange={handleChange} className={inputClass} />
          {!editingId && (
            <>
              <input name="email" type="email" placeholder="Email (login)" value={form.email} onChange={handleChange} className={inputClass} required />
              <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} className={inputClass} required />
            </>
          )}
          <button type="submit" className="bg-teal hover:bg-teal/90 text-white py-2 rounded md:col-span-2">
            {editingId ? 'Update Teacher' : 'Save Teacher'}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-slate-600">
              <th className="py-2">Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="py-2">{t.full_name}</td>
                <td>{t.phone || '-'}</td>
                <td>{t.email}</td>
                <td className="space-x-3">
                  <button onClick={() => openEdit(t)} className="text-blue-600 hover:underline">Edit</button>
                  <button onClick={() => remove(t.id)} className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr><td colSpan="4" className="py-4 text-slate-500">No teachers yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
