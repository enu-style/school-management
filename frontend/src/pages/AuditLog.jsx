import { useEffect, useState } from 'react'
import api from '../api'

const entities = ['', 'auth', 'students', 'teachers', 'classes', 'subjects', 'assignments', 'attendance', 'exams', 'grades', 'announcements', 'password']
const actions = ['', 'login', 'login_failed', 'create', 'update', 'delete']

export default function AuditLog() {
  const [data, setData] = useState({ rows: [], total: 0, pages: 1 })
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const [action, setAction] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setError('')
    api.get('/audit', { params: { page, entity, action } })
      .then((r) => setData(r.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load the audit log'))
  }, [page, entity, action])

  const inputClass = 'border border-slate-300 rounded px-3 py-2'
  const badge = {
    login: 'bg-green-100 text-green-700',
    login_failed: 'bg-red-100 text-red-700',
    create: 'bg-blue-100 text-blue-700',
    update: 'bg-yellow-100 text-yellow-700',
    delete: 'bg-red-100 text-red-700',
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
      <h2 className="text-lg font-semibold mb-4">Audit Log</h2>
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <div className="flex flex-wrap gap-4 mb-4">
        <select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1) }} className={inputClass}>
          {entities.map((x) => <option key={x} value={x}>{x || 'All areas'}</option>)}
        </select>
        <select value={action} onChange={(e) => { setAction(e.target.value); setPage(1) }} className={inputClass}>
          {actions.map((x) => <option key={x} value={x}>{x || 'All actions'}</option>)}
        </select>
        <span className="self-center text-sm text-slate-500">{data.total} records</span>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b text-slate-600">
            <th className="py-2">Time</th>
            <th>User</th>
            <th>Action</th>
            <th>Area</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id} className="border-b align-top">
              <td className="py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
              <td>{r.user_email || '-'}</td>
              <td><span className={`px-2 py-1 rounded text-xs ${badge[r.action] || ''}`}>{r.action}</span></td>
              <td>{r.entity}{r.entity_id ? ` #${r.entity_id}` : ''}</td>
              <td>
                <details>
                  <summary className="cursor-pointer text-blue-600">View</summary>
                  <pre className="text-xs bg-slate-50 p-2 rounded mt-1 max-w-md overflow-x-auto">{JSON.stringify(r.details, null, 2)}</pre>
                  <p className="text-xs text-slate-400 mt-1">IP: {r.ip}</p>
                </details>
              </td>
            </tr>
          ))}
          {data.rows.length === 0 && <tr><td colSpan="5" className="py-4 text-slate-500">No records.</td></tr>}
        </tbody>
      </table>

      <div className="flex items-center gap-4 mt-4">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Previous</button>
        <span className="text-sm">Page {page} of {data.pages}</span>
        <button disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Next</button>
      </div>
    </div>
  )
}
