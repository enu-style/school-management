import { useEffect, useState } from 'react'
import api from '../api'

const emptyForm = {
  full_name: '',
  email: '',
  password: '',
  gender: 'male',
  date_of_birth: '',
  class_id: '',
}

export default function Students() {
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  const loadStudents = async (term = '') => {
    try {
      const res = await api.get('/students', { params: { search: term } })
      setStudents(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load students')
    }
  }

  const loadClasses = async () => {
    try {
      const res = await api.get('/classes')
      setClasses(res.data)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (user.role === 'admin' || user.role === 'teacher') {
      loadStudents()
      loadClasses()
    }
  }, [])

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const openAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError('')
    setMessage('')
  }

  const openEdit = (s) => {
    setEditingId(s.id)
    setForm({
      ...emptyForm,
      full_name: s.full_name,
      gender: s.gender || 'male',
      date_of_birth: s.date_of_birth || '',
      class_id: s.class_id || '',
    })
    setShowForm(true)
    setError('')
    setMessage('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const saveStudent = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    const data = {
      ...form,
      class_id: form.class_id || null,
      date_of_birth: form.date_of_birth || null,
    }
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, data)
        setMessage('Student updated successfully')
      } else {
        await api.post('/students', data)
        setMessage('Student added successfully')
      }
      closeForm()
      loadStudents(search)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save student')
    }
  }

  const deleteStudent = async (id) => {
    if (!window.confirm('Delete this student and their login account?')) return
    try {
      await api.delete(`/students/${id}`)
      setMessage('Student deleted')
      loadStudents(search)
    } catch (err) {
      setError(err.response?.data?.error || 'Could not delete student')
    }
  }

  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  if (user.role === 'student') {
    return <p className="bg-white p-6 rounded shadow">Student pages (grades, attendance) are coming soon.</p>
  }

  return (
    <div className="bg-white p-6 rounded shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Students</h2>
        {user.role === 'admin' && (
          <button
            onClick={showForm ? closeForm : openAdd}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            {showForm ? 'Cancel' : '+ Add Student'}
          </button>
        )}
      </div>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      {showForm && (
        <form onSubmit={saveStudent} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 p-4 border rounded bg-slate-50">
          <h3 className="md:col-span-2 font-semibold">{editingId ? 'Edit student' : 'New student'}</h3>
          <input name="full_name" placeholder="Full name" value={form.full_name} onChange={handleChange} className={inputClass} required />
          {!editingId && (
            <>
              <input name="email" type="email" placeholder="Email (login)" value={form.email} onChange={handleChange} className={inputClass} required />
              <input name="password" type="password" placeholder="Password" value={form.password} onChange={handleChange} className={inputClass} required />
            </>
          )}
          <select name="gender" value={form.gender} onChange={handleChange} className={inputClass}>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <input name="date_of_birth" type="date" value={form.date_of_birth} onChange={handleChange} className={inputClass} />
          <select name="class_id" value={form.class_id} onChange={handleChange} className={inputClass}>
            <option value="">No class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name} - {c.section} ({c.academic_year})</option>
            ))}
          </select>
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white py-2 rounded md:col-span-2">
            {editingId ? 'Update Student' : 'Save Student'}
          </button>
        </form>
      )}

      <input
        type="text"
        placeholder="Search by name..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          loadStudents(e.target.value)
        }}
        className="border border-slate-300 rounded px-3 py-2 mb-4 w-full max-w-xs"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b text-slate-600">
              <th className="py-2">Name</th>
              <th>Gender</th>
              <th>Class</th>
              <th>Email</th>
              {user.role === 'admin' && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2">{s.full_name}</td>
                <td>{s.gender}</td>
                <td>{s.class_name ? `${s.class_name} - ${s.section}` : '-'}</td>
                <td>{s.email}</td>
                {user.role === 'admin' && (
                  <td className="space-x-3">
                    <button onClick={() => openEdit(s)} className="text-blue-600 hover:underline">Edit</button>
                    <button onClick={() => deleteStudent(s.id)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                )}
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan="5" className="py-4 text-slate-500">No students found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
