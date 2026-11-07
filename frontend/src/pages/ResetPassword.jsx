import { useEffect, useState } from 'react'
import api from '../api'

export default function ResetPassword() {
  const [type, setType] = useState('student')
  const [people, setPeople] = useState([])
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    setId('')
    setPeople([])
    const url = type === 'student' ? '/students' : '/teachers'
    api.get(url)
      .then((r) => setPeople(r.data))
      .catch(() => setError('Could not load the list'))
  }, [type])

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      await api.post('/password/reset', { type, id, new_password: password })
      setMessage('Password reset. Tell the person their new password.')
      setPassword('')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not reset password')
    }
  }

  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded shadow max-w-md">
      <h2 className="text-lg font-semibold mb-4">Reset a User's Password</h2>
      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}
      <form onSubmit={submit} className="space-y-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
        </select>
        <select value={id} onChange={(e) => setId(e.target.value)} className={inputClass} required>
          <option value="">Select person</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.full_name} ({p.email})</option>
          ))}
        </select>
        <input type="text" placeholder="New password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} required />
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded">Reset Password</button>
      </form>
    </div>
  )
}
