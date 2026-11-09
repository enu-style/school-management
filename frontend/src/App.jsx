import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Students from "./pages/Students";
import Teachers from "./pages/Teachers";
import Subjects from "./pages/Subjects";
import Assignments from "./pages/Assignments";
import Attendance from "./pages/Attendance";
import Exams from "./pages/Exams";
import Grades from "./pages/Grades";
import Reports from "./pages/Reports";
import ReportCard from "./pages/ReportCard";
import Overview from "./pages/Overview";
import Announcements from "./pages/Announcements";
import AuditLog from "./pages/AuditLog";
import ChangePassword from "./pages/ChangePassword";
import ResetPassword from "./pages/ResetPassword";
import AcademicYears from "./pages/AcademicYears";
import Promotion from "./pages/Promotion";
import MyResults from "./pages/MyResults";
import Guardians from "./pages/Guardians";
import ParentHome from "./pages/ParentHome";
import ParentResults from "./pages/ParentResults";
import Layout from "./components/Layout";

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/" replace />;
}

const currentRole = () => JSON.parse(localStorage.getItem("user") || "{}").role;

// /dashboard: students see their results, parents go to their children, staff see the students list
function Home() {
  const role = currentRole();
  if (role === "student") return <MyResults />;
  if (role === "parent") return <Navigate to="/children" replace />;
  return <Students />;
}

// /overview is the staff dashboard
function OverviewGate() {
  const role = currentRole();
  if (role === "parent") return <Navigate to="/children" replace />;
  if (role === "student") return <Navigate to="/dashboard" replace />;
  return <Overview />;
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
        <Route path="/overview" element={<OverviewGate />} />
        <Route path="/teachers" element={<Teachers />} />
        <Route path="/subjects" element={<Subjects />} />
        <Route path="/assignments" element={<Assignments />} />
        <Route path="/attendance" element={<Attendance />} />
        <Route path="/exams" element={<Exams />} />
        <Route path="/grades" element={<Grades />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/report-card" element={<ReportCard />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/years" element={<AcademicYears />} />
        <Route path="/promotion" element={<Promotion />} />
        <Route path="/guardians" element={<Guardians />} />
        <Route path="/children" element={<ParentHome />} />
        <Route path="/child-results" element={<ParentResults />} />
      </Route>
    </Routes>
  );
}
