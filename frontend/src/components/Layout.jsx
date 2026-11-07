import { NavLink, Outlet, useNavigate } from "react-router-dom";

export default function Layout() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const staff = user.role === "admin" || user.role === "teacher";

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const linkClass = ({ isActive }) =>
    `px-2 py-1 text-sm rounded ${isActive ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-200"}`;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow px-6 py-3 flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-6">
          <h1 className="text-xl font-bold">School Management</h1>
          <nav className="flex flex-wrap gap-2">
            <NavLink to="/announcements" className={linkClass}>
              Announcements
            </NavLink>
            {user.role === "student" && (
              <NavLink to="/dashboard" className={linkClass}>
                My Results
              </NavLink>
            )}
            {staff && (
              <NavLink to="/dashboard" className={linkClass}>
                Students
              </NavLink>
            )}
            {user.role === "admin" && (
              <>
                <NavLink to="/teachers" className={linkClass}>
                  Teachers
                </NavLink>
                <NavLink to="/subjects" className={linkClass}>
                  Subjects
                </NavLink>
                <NavLink to="/assignments" className={linkClass}>
                  Assignments
                </NavLink>
                <NavLink to="/exams" className={linkClass}>
                  Exams
                </NavLink>
              </>
            )}
            {staff && (
              <>
                <NavLink to="/attendance" className={linkClass}>
                  Attendance
                </NavLink>
                <NavLink to="/grades" className={linkClass}>
                  Grades
                </NavLink>
                <NavLink to="/reports" className={linkClass}>
                  Reports
                </NavLink>
              </>
            )}
            {user.role === "admin" && (
              <NavLink to="/reset-password" className={linkClass}>
                Reset Password
              </NavLink>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-500 capitalize">{user.role}</span>
          <NavLink to="/change-password" className={linkClass}>
            My Password
          </NavLink>
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="p-6 max-w-5xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
