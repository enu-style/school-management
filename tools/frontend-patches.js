const apply = require("./patch");

apply([
  // routes
  [
    "frontend/src/App.jsx",
    "import Layout from './components/Layout'",
    "import AcademicYears from './pages/AcademicYears'\nimport Promotion from './pages/Promotion'\nimport Layout from './components/Layout'",
  ],
  [
    "frontend/src/App.jsx",
    '<Route path="/announcements" element={<Announcements />} />',
    '<Route path="/announcements" element={<Announcements />} />\n        <Route path="/years" element={<AcademicYears />} />\n        <Route path="/promotion" element={<Promotion />} />',
  ],

  // sidebar, titles, and the active year in the top bar
  [
    "frontend/src/components/Layout.jsx",
    "import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'",
    "import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'\nimport api from '../api'",
  ],
  [
    "frontend/src/components/Layout.jsx",
    "ClipboardList, CalendarCheck, FileText,",
    "ClipboardList, CalendarCheck, CalendarRange, TrendingUp, FileText,",
  ],
  [
    "frontend/src/components/Layout.jsx",
    "      { to: '/attendance', label: 'Attendance', icon: CalendarCheck, roles: STAFF },",
    "      { to: '/attendance', label: 'Attendance', icon: CalendarCheck, roles: STAFF },\n      { to: '/years', label: 'Academic Years', icon: CalendarRange, roles: ['admin'] },\n      { to: '/promotion', label: 'Promotion', icon: TrendingUp, roles: ['admin'] },",
  ],
  [
    "frontend/src/components/Layout.jsx",
    "  '/change-password': ['My Password', 'Change your own password'],",
    "  '/change-password': ['My Password', 'Change your own password'],\n  '/years': ['Academic Years', 'Years, semesters, and their dates'],\n  '/promotion': ['Promotion', 'Move students to the next academic year'],",
  ],
  [
    "frontend/src/components/Layout.jsx",
    "  const menuRef = useRef(null)",
    "  const menuRef = useRef(null)\n  const [year, setYear] = useState(null)\n\n  useEffect(() => {\n    api.get('/years/active').then((r) => setYear(r.data)).catch(() => setYear(null))\n  }, [location.pathname])",
  ],
  [
    "frontend/src/components/Layout.jsx",
    '<p className="text-xs text-slate-400">Home / {title}</p>',
    "<p className=\"text-xs text-slate-400\">Home / {title}{year ? ' | Academic year ' + year.name : ''}</p>",
  ],

  // student profile shows the academic history
  [
    "frontend/src/pages/Students.jsx",
    "import { useToast, useConfirm } from '../components/Feedback'",
    "import { useToast, useConfirm } from '../components/Feedback'\nimport StudentHistory from '../components/StudentHistory'",
  ],
  [
    "frontend/src/pages/Students.jsx",
    "</dl>",
    "</dl>\n          <StudentHistory studentId={viewing.id} />",
  ],

  // grade entry loads the assessments of the chosen class's year
  [
    "frontend/src/pages/Grades.jsx",
    "    if (!classId) return\n    api.get('/grades/subjects', { params: { class_id: classId } })",
    "    if (!classId) return\n    setExamId('')\n    api.get('/exams', { params: { class_id: classId } })\n      .then((r) => setExams(r.data))\n      .catch(() => toast('Could not load assessments', 'error'))\n    api.get('/grades/subjects', { params: { class_id: classId } })",
  ],
]);
