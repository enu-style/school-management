import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Students from './pages/Students'
import Teachers from './pages/Teachers'
import Subjects from './pages/Subjects'
import Assignments from './pages/Assignments'
import Attendance from './pages/Attendance'
import Exams from './pages/Exams'
import Grades from './pages/Grades'
import Reports from './pages/Reports'
import Announcements from './pages/Announcements'
import AuditLog from './pages/AuditLog'
import Overview from './pages/Overview'
import ReportCard from './pages/ReportCard'
import ChangePassword from './pages/ChangePassword'
import ResetPassword from './pages/ResetPassword'
import MyResults from './pages/MyResults'
import Layout from './components/Layout'

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/" replace />
}

// Students see their results, staff see the students list
function Home() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  return user.role === 'student' ? <MyResults /> : <Students />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Home />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/overview" element={<Overview />} />
        <Route path="/report-card" element={<ReportCard />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
      </Route>
    </Routes>
  )
}
