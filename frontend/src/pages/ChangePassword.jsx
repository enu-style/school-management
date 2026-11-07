import { useState } from 'react'
import api from '../api'

export default function ChangePassword() {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (form.new_password !== form.confirm) return setError('New passwords do not match')
    try {
      await api.post('/password/change', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      setMessage('Password changed successfully')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change password')
    }
  }

  const inputClass = 'w-full border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded shadow max-w-md">
      <h2 className="text-lg font-semibold mb-4">Change My Password</h2>
      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}
      <form onSubmit={submit} className="space-y-3">
        <input name="current_password" type="password" placeholder="Current password" value={form.current_password} onChange={handleChange} className={inputClass} required />
        <input name="new_password" type="password" placeholder="New password (8+ characters)" value={form.new_password} onChange={handleChange} className={inputClass} required />
        <input name="confirm" type="password" placeholder="Confirm new password" value={form.confirm} onChange={handleChange} className={inputClass} required />
        <button type="submit" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded">Change Password</button>
      </form>
    </div>
  )
}
