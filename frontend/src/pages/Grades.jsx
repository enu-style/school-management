import { useEffect, useState } from 'react'
import api from '../api'

export default function Grades() {
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [exams, setExams] = useState([])
  const [classId, setClassId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [examId, setExamId] = useState('')
  const [students, setStudents] = useState([])
  const [scores, setScores] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const exam = exams.find((x) => String(x.id) === String(examId))
  const max = exam ? exam.max_score : 100

  useEffect(() => {
    api.get('/attendance/classes').then((r) => setClasses(r.data)).catch(() => setError('Could not load classes'))
    api.get('/exams').then((r) => setExams(r.data)).catch(() => setError('Could not load assessments'))
  }, [])

  useEffect(() => {
    setSubjectId('')
    setSubjects([])
    setStudents([])
    if (!classId) return
    api.get('/grades/subjects', { params: { class_id: classId } })
      .then((r) => setSubjects(r.data))
      .catch((err) => setError(err.response?.data?.error || 'Could not load subjects'))
  }, [classId])

  useEffect(() => {
    if (!classId || !subjectId || !examId) {
      setStudents([])
      return
    }
    setError('')
    setMessage('')
    api.get('/grades', { params: { class_id: classId, subject_id: subjectId, exam_id: examId } })
      .then((r) => {
        setStudents(r.data)
        const map = {}
        r.data.forEach((s) => { map[s.student_id] = s.score ?? '' })
        setScores(map)
      })
      .catch((err) => setError(err.response?.data?.error || 'Could not load students'))
  }, [classId, subjectId, examId])

  const save = async () => {
    setError('')
    setMessage('')
    const tooHigh = Object.values(scores).some((v) => v !== '' && Number(v) > max)
    if (tooHigh) return setError(`A score is higher than the maximum (${max})`)
    try {
      const records = students.map((s) => ({ student_id: s.student_id, score: scores[s.student_id] }))
      await api.post('/grades', { class_id: classId, subject_id: subjectId, exam_id: examId, records })
      setMessage('Grades saved')
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save grades')
    }
  }

  const filled = Object.values(scores).filter((v) => v !== '' && v !== null)
  const average = filled.length
    ? (filled.reduce((a, b) => a + Number(b), 0) / filled.length).toFixed(1)
    : '-'

  const inputClass = 'border border-slate-300 rounded px-3 py-2'

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-4">Enter Grades</h2>

      {message && <p className="bg-green-100 text-green-700 p-3 rounded mb-3">{message}</p>}
      {error && <p className="bg-red-100 text-red-700 p-3 rounded mb-3">{error}</p>}

      <div className="flex flex-wrap gap-4 mb-6">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} className={inputClass}>
          <option value="">Select class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} - {c.section}</option>)}
        </select>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className={inputClass} disabled={!classId}>
          <option value="">Select subject</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={examId} onChange={(e) => setExamId(e.target.value)} className={inputClass}>
          <option value="">Select assessment</option>
          {exams.map((x) => <option key={x.id} value={x.id}>{x.term} - {x.name} (out of {x.max_score})</option>)}
        </select>
      </div>

      {classId && subjects.length === 0 && (
        <p className="text-slate-500 mb-4">No subjects assigned for this class yet. Ask the admin to assign one in Assignments.</p>
      )}

      {students.length > 0 && (
        <>
          <p className="text-sm text-slate-600 mb-3">Average: <b>{average}</b> / {max}</p>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b text-slate-600">
                <th className="py-2">Student</th>
                <th>Score (0 - {max})</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id} className="border-b">
                  <td className="py-2">{s.full_name}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max={max}
                      step="0.5"
                      value={scores[s.student_id] ?? ''}
                      onChange={(e) => setScores({ ...scores, [s.student_id]: e.target.value })}
                      className="border border-slate-300 rounded px-3 py-1 w-28"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={save} className="mt-6 bg-teal hover:bg-teal/90 text-white px-6 py-2 rounded">
            Save Grades
          </button>
        </>
      )}

      {classId && subjectId && examId && students.length === 0 && (
        <p className="text-slate-500">No students in this class.</p>
      )}
    </div>
  )
}
