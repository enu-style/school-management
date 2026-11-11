import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import {
  LayoutDashboard,
  Award,
  ScrollText,
  Megaphone,
  GraduationCap,
  Users,
  BookOpen,
  ClipboardList,
  CalendarCheck,
  CalendarRange,
  LayoutGrid,
  CalendarClock,
  TrendingUp,
  FileText,
  PenLine,
  BarChart3,
  KeyRound,
  ShieldCheck,
  ChevronDown,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Lock,
  Receipt,
  CreditCard,
  Settings,
  Wallet,
} from "lucide-react";

const STAFF = ["admin", "teacher"];
const FIN = ["admin", "accountant"];
const EVERYONE = ["admin", "teacher", "student", "parent", "accountant"];

const groups = [
  {
    title: "Main",
    items: [
      {
        to: "/overview",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: STAFF,
      },
      {
        to: "/dashboard",
        label: "My Results",
        icon: Award,
        roles: ["student"],
      },
      {
        to: "/children",
        label: "My Children",
        icon: GraduationCap,
        roles: ["parent"],
      },
      {
        to: "/child-results",
        label: "Child Results",
        icon: Award,
        roles: ["parent"],
      },
      { to: "/child-fees", label: "Fees", icon: Wallet, roles: ["parent"] },
      {
        to: "/report-card",
        label: "Report Card",
        icon: ScrollText,
        roles: ["admin", "teacher", "student", "parent"],
      },
      {
        to: "/announcements",
        label: "Announcements",
        icon: Megaphone,
        roles: EVERYONE,
      },
    ],
  },
  {
    title: "People",
    items: [
      {
        to: "/dashboard",
        label: "Students",
        icon: GraduationCap,
        roles: STAFF,
      },
      { to: "/teachers", label: "Teachers", icon: Users, roles: ["admin"] },
      { to: "/guardians", label: "Parents", icon: Users, roles: ["admin"] },
    ],
  },
  {
    title: "Academics",
    items: [
      { to: "/subjects", label: "Subjects", icon: BookOpen, roles: ["admin"] },
      {
        to: "/assignments",
        label: "Assignments",
        icon: ClipboardList,
        roles: ["admin"],
      },
      {
        to: "/attendance",
        label: "Attendance",
        icon: CalendarCheck,
        roles: STAFF,
      },
      {
        to: "/years",
        label: "Academic Years",
        icon: CalendarRange,
        roles: ["admin"],
      },
      { to: '/classes', label: 'Grades & Sections', icon: LayoutGrid, roles: ['admin'] },
      {
        to: "/promotion",
        label: "Promotion",
        icon: TrendingUp,
        roles: ["admin"],
      },
      { to: '/timetable', label: 'Timetable', icon: CalendarClock, roles: ['admin', 'teacher', 'student', 'parent'] },
      { to: '/timetable-setup', label: 'Timetable Setup', icon: Settings, roles: ['admin'] },
    ],
  },
  {
    title: "Assessment",
    items: [
      { to: "/exams", label: "Exams", icon: FileText, roles: ["admin"] },
      { to: "/grades", label: "Grades", icon: PenLine, roles: STAFF },
      { to: "/reports", label: "Reports", icon: BarChart3, roles: STAFF },
    ],
  },
  {
    title: "Finance",
    items: [
      { to: "/invoices", label: "Invoices", icon: Receipt, roles: FIN },
      { to: "/payments", label: "Payments", icon: CreditCard, roles: FIN },
      { to: "/fee-setup", label: "Fee Setup", icon: Settings, roles: FIN },
      { to: "/fee-reports", label: "Fee Reports", icon: BarChart3, roles: FIN },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        to: "/accountants",
        label: "Accountants",
        icon: Users,
        roles: ["admin"],
      },
      {
        to: "/reset-password",
        label: "Reset Password",
        icon: KeyRound,
        roles: ["admin"],
      },
      { to: "/audit", label: "Audit Log", icon: ShieldCheck, roles: ["admin"] },
    ],
  },
];

const pages = {
  "/overview": ["Dashboard", "School statistics at a glance"],
  "/dashboard": ["Students", "Add, edit, and search student records"],
  "/teachers": ["Teachers", "Manage teacher accounts"],
  "/guardians": ["Parents", "Parent accounts and the children linked to them"],
  "/children": ["My Children", "Your children at a glance"],
  "/child-results": ["Child Results", "Grades and attendance of your child"],
  "/child-fees": ["Fees", "Invoices, balances, and receipts"],
  "/subjects": ["Subjects", "Manage the subjects taught at school"],
  "/assignments": [
    "Teacher Assignments",
    "Assign teachers to subjects and classes",
  ],
  "/attendance": ["Attendance", "Record daily attendance by class"],
  "/years": ["Academic Years", "Years, semesters, and their dates"],
  '/classes': ['Grades & Sections', 'How many sections each grade has, and how big they are'],
  "/promotion": ["Promotion", "Move students to the next academic year"],
  '/timetable': ['Timetable', 'Weekly lessons by class, teacher, and room'],
  '/timetable-setup': ['Timetable Setup', 'Lesson periods, breaks, and classrooms'],
  "/exams": ["Exams", "Configure assessments and their maximum marks"],
  "/grades": ["Grades", "Enter and update student marks"],
  "/reports": ["Reports", "Totals and letter grades per subject or class"],
  "/report-card": ["Report Card", "View and print student report cards"],
  "/invoices": ["Invoices", "Fee invoices and their balances"],
  "/payments": ["Payments", "Every payment and its receipt"],
  "/fee-setup": ["Fee Setup", "Set the fees for each grade and year"],
  "/fee-reports": ["Fee Reports", "Collections and outstanding balances"],
  "/accountants": ["Accountants", "Staff accounts for the finance office"],
  "/announcements": ["Announcements", "School news and notices"],
  "/reset-password": ["Reset Password", "Set a new password for a user"],
  "/audit": ["Audit Log", "A record of who did what and when"],
  "/change-password": ["My Password", "Change your own password"],
};

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [closed, setClosed] = useState({});
  const [year, setYear] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    api
      .get("/years/active")
      .then((r) => setYear(r.data))
      .catch(() => setYear(null));
  }, [location.pathname]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  let [title, description] =
    pages[location.pathname] ||
    (location.pathname.startsWith("/receipt/")
      ? ["Receipt", "Payment receipt"]
      : ["School Management", ""]);
  if (user.role === "student" && location.pathname === "/dashboard") {
    title = "My Results";
    description = "Your grades and attendance";
  }

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
      isActive
        ? "bg-teal text-white"
        : "text-slate-300 hover:bg-white/10 hover:text-white"
    } ${collapsed ? "lg:justify-center" : ""}`;

  const hideWhenCollapsed = collapsed ? "lg:hidden" : "";
  const roleLabel =
    (user.role || "").charAt(0).toUpperCase() + (user.role || "").slice(1);

  return (
    <div className="flex min-h-screen">
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden print:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`print:hidden fixed inset-y-0 left-0 z-40 w-64 bg-navy text-white flex flex-col transform transition-transform duration-200
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen ${collapsed ? "lg:w-20" : "lg:w-64"}`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-teal rounded-lg p-2">
              <GraduationCap size={20} />
            </div>
            <span className={`font-semibold ${hideWhenCollapsed}`}>
              School Management
            </span>
          </div>
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
          {groups.map((g) => {
            const items = g.items.filter((i) => i.roles.includes(user.role));
            if (items.length === 0) return null;
            const open = !closed[g.title] || collapsed;
            return (
              <div key={g.title}>
                <button
                  onClick={() =>
                    setClosed({ ...closed, [g.title]: !closed[g.title] })
                  }
                  className={`w-full flex items-center justify-between px-3 mb-1 text-xs uppercase tracking-wider text-slate-400 hover:text-white ${hideWhenCollapsed}`}
                >
                  {g.title}
                  <ChevronDown
                    size={14}
                    className={`transition ${open ? "" : "-rotate-90"}`}
                  />
                </button>
                {collapsed && (
                  <div className="hidden lg:block border-t border-white/10 mb-2" />
                )}
                {open && (
                  <div className="space-y-1">
                    {items.map((i) => (
                      <NavLink
                        key={i.to + i.label}
                        to={i.to}
                        className={linkClass}
                        title={i.label}
                      >
                        <i.icon size={18} className="shrink-0" />
                        <span className={hideWhenCollapsed}>{i.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="print:hidden sticky top-0 z-20 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
            <button
              className="hidden lg:block text-slate-500 hover:text-ink"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Toggle sidebar"
            >
              {collapsed ? (
                <PanelLeftOpen size={20} />
              ) : (
                <PanelLeftClose size={20} />
              )}
            </button>
            <div>
              <p className="text-xs text-slate-400">
                Home / {title}
                {year ? " | Academic year " + year.name : ""}
              </p>
              <h1 className="text-lg font-semibold leading-tight">{title}</h1>
            </div>
          </div>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-slate-100"
            >
              <span className="w-9 h-9 rounded-full bg-teal text-white flex items-center justify-center font-semibold">
                {roleLabel.charAt(0)}
              </span>
              <span className="hidden sm:block text-sm font-medium">
                {roleLabel}
              </span>
              <ChevronDown size={16} className="text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1">
                <button
                  onClick={() => navigate("/change-password")}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50"
                >
                  <Lock size={16} /> Change password
                </button>
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-slate-50"
                >
                  <LogOut size={16} /> Log out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="p-4 sm:p-6 w-full max-w-6xl mx-auto print:p-0">
          {description && (
            <p className="text-sm text-slate-500 mb-4 print:hidden">
              {description}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
