import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  GraduationCap,
  Users,
  School,
  BookOpen,
  UserCheck,
} from "lucide-react";
import api from "../api";

const NAVY = "#142B4A";
const TEAL = "#0D9488";
const GRADE_COLORS = {
  A: "#16A34A",
  B: "#0D9488",
  C: "#F59E0B",
  D: "#EA580C",
  F: "#DC2626",
};

function Card({ title, action, children }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-4">
      <div className="rounded-lg p-3 text-white" style={{ background: color }}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-slate-400 text-center px-4">
      {text}
    </div>
  );
}

function Donut({ data }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
          >
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 bg-slate-200 rounded-xl" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="h-72 bg-slate-200 rounded-xl" />
        <div className="h-72 bg-slate-200 rounded-xl" />
      </div>
    </div>
  );
}

export default function Overview() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";
  const [term, setTerm] = useState("Semester 1");
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    api
      .get("/stats", { params: { term } })
      .then((r) => setData(r.data))
      .catch((err) =>
        setError(err.response?.data?.error || "Could not load the dashboard"),
      );
  }, [term]);

  useEffect(() => {
    api
      .get("/stats-extra")
      .then((r) => setExtra(r.data))
      .catch(() => setExtra(null));
  }, []);

  if (error)
    return <p className="bg-red-100 text-red-700 p-4 rounded-lg">{error}</p>;
  if (!data) return <Skeleton />;

  const att = data.attendance_today;
  const marked = att.present + att.absent + att.late;
  const rate = marked
    ? Math.round(((att.present + att.late) / marked) * 100)
    : null;

  const perGrade = data.per_grade.map((g) => ({
    grade: g.name.replace("Grade ", ""),
    students: g.n,
  }));
  const attendanceData = [
    { name: "Present", value: att.present, color: "#16A34A" },
    { name: "Late", value: att.late, color: "#F59E0B" },
    { name: "Absent", value: att.absent, color: "#DC2626" },
  ].filter((d) => d.value > 0);
  const distribution = Object.entries(data.distribution).map(
    ([grade, count]) => ({ grade, count }),
  );
  const genderData = (extra?.gender || []).map((g) => ({
    name:
      g.gender === "male"
        ? "Male"
        : g.gender === "female"
          ? "Female"
          : "Not set",
    value: g.n,
    color:
      g.gender === "male" ? NAVY : g.gender === "female" ? TEAL : "#94A3B8",
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat
          label="Students"
          value={data.counts.students}
          icon={GraduationCap}
          color={NAVY}
        />
        {data.counts.teachers !== null && (
          <Stat
            label="Teachers"
            value={data.counts.teachers}
            icon={Users}
            color={TEAL}
          />
        )}
        <Stat
          label="Classes"
          value={data.counts.classes}
          icon={School}
          color="#2563EB"
        />
        {data.counts.subjects !== null && (
          <Stat
            label="Subjects"
            value={data.counts.subjects}
            icon={BookOpen}
            color="#7C3AED"
          />
        )}
        <Stat
          label="Attendance today"
          value={rate === null ? "-" : `${rate}%`}
          icon={UserCheck}
          color="#16A34A"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card title="Students per Grade">
          {data.counts.students === 0 ? (
            <Empty text="No students yet. Add students to see this chart." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perGrade}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="grade"
                    label={{
                      value: "Grade",
                      position: "insideBottom",
                      offset: -2,
                    }}
                  />
                  <YAxis allowDecimals={false} />
                  <Tooltip labelFormatter={(l) => `Grade ${l}`} />
                  <Bar dataKey="students" fill={NAVY} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Today's Attendance">
          {attendanceData.length === 0 ? (
            <Empty text="No attendance has been taken today. Open Attendance to record it." />
          ) : (
            <Donut data={attendanceData} />
          )}
        </Card>

        <Card
          title="Grade Distribution"
          action={
            <select
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1 text-sm"
            >
              <option>Semester 1</option>
              <option>Semester 2</option>
            </select>
          }
        >
          {data.graded_entries === 0 ? (
            <Empty text="No fully graded subjects yet. Enter every assessment for a subject in Grades." />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="grade" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" name="Results" radius={[4, 4, 0, 0]}>
                    {distribution.map((d) => (
                      <Cell key={d.grade} fill={GRADE_COLORS[d.grade]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Gender Distribution">
          {genderData.length === 0 ? (
            <Empty text="No student data yet." />
          ) : (
            <Donut data={genderData} />
          )}
        </Card>
      </div>

      <div
        className={`grid gap-6 ${isAdmin ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
      >
        <Card title="Recent Registrations">
          {(extra?.recent_students || []).length === 0 ? (
            <p className="text-sm text-slate-400">No students yet.</p>
          ) : (
            <ul className="divide-y">
              {extra.recent_students.map((s, i) => (
                <li key={i} className="py-2 flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-teal text-white flex items-center justify-center text-sm font-semibold">
                    {s.full_name.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.full_name}
                    </p>
                    <p className="text-xs text-slate-400">
                      {s.class_name
                        ? `${s.class_name} - ${s.section}`
                        : "No class"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isAdmin && (
          <Card
            title="Recent Activity"
            action={
              <Link to="/audit" className="text-sm text-teal hover:underline">
                View all
              </Link>
            }
          >
            {(extra?.activity || []).length === 0 ? (
              <p className="text-sm text-slate-400">
                No activity recorded yet.
              </p>
            ) : (
              <ul className="divide-y">
                {extra.activity.map((a, i) => (
                  <li key={i} className="py-2">
                    <p className="text-sm">
                      <span className="font-medium">
                        {a.user_email || "Unknown"}
                      </span>{" "}
                      {a.action} {a.entity}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card
          title="Announcements"
          action={
            <Link
              to="/announcements"
              className="text-sm text-teal hover:underline"
            >
              View all
            </Link>
          }
        >
          {data.announcements.length === 0 ? (
            <p className="text-sm text-slate-400">No announcements yet.</p>
          ) : (
            <ul className="divide-y">
              {data.announcements.map((a, i) => (
                <li key={i} className="py-2">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(a.created_at).toLocaleDateString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
