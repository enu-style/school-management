import { useEffect, useState } from "react";
import api from "../api";
import { useToast } from "../components/Feedback";

const today = new Date().toLocaleDateString("en-CA");

export default function Attendance() {
  const toast = useToast();
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today);
  const [students, setStudents] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get("/attendance/classes")
      .then((res) => setClasses(res.data))
      .catch((err) =>
        toast(err.response?.data?.error || "Could not load classes", "error"),
      );
  }, []);

  useEffect(() => {
    if (!classId || !date) return;
    api
      .get("/attendance", { params: { class_id: classId, date } })
      .then((res) => {
        setStudents(res.data);
        const map = {};
        res.data.forEach((s) => {
          map[s.student_id] = s.status || "present";
        });
        setStatuses(map);
      })
      .catch((err) =>
        toast(err.response?.data?.error || "Could not load students", "error"),
      );
  }, [classId, date]);

  const setStatus = (id, status) => setStatuses({ ...statuses, [id]: status });

  const markAll = (status) => {
    const map = {};
    students.forEach((s) => {
      map[s.student_id] = status;
    });
    setStatuses(map);
  };

  const save = async () => {
    setSaving(true);
    try {
      const records = students.map((s) => ({
        student_id: s.student_id,
        status: statuses[s.student_id],
      }));
      await api.post("/attendance", { class_id: classId, date, records });
      toast("Attendance saved");
    } catch (err) {
      toast(err.response?.data?.error || "Could not save attendance", "error");
    } finally {
      setSaving(false);
    }
  };

  const count = (status) =>
    Object.values(statuses).filter((v) => v === status).length;

  const btn = (id, status, label, active) => (
    <button
      type="button"
      onClick={() => setStatus(id, status)}
      className={`px-3 py-1 rounded-lg border text-sm ${statuses[id] === status ? active : "bg-white text-slate-600 hover:bg-slate-100"}`}
    >
      {label}
    </button>
  );

  const inputClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex flex-wrap gap-4 border-b">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} - {c.section}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </div>

      {classes.length === 0 && (
        <p className="p-6 text-slate-500">
          No classes available. Ask the admin to assign you to a class.
        </p>
      )}

      {!classId && classes.length > 0 && (
        <p className="p-12 text-center text-slate-400">
          Select a class to take attendance.
        </p>
      )}

      {classId && (
        <>
          <div className="px-6 py-3 flex flex-wrap items-center gap-4 border-b text-sm">
            <button
              onClick={() => markAll("present")}
              className="text-teal hover:underline"
            >
              Mark all present
            </button>
            <span className="text-slate-600">
              Present: <b>{count("present")}</b> | Absent:{" "}
              <b>{count("absent")}</b> | Late: <b>{count("late")}</b>
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="pl-6">Student</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.student_id} className="border-b">
                    <td className="pl-6 font-medium">{s.full_name}</td>
                    <td className="space-x-2 py-2">
                      {btn(
                        s.student_id,
                        "present",
                        "Present",
                        "bg-success text-white border-success",
                      )}
                      {btn(
                        s.student_id,
                        "absent",
                        "Absent",
                        "bg-danger text-white border-danger",
                      )}
                      {btn(
                        s.student_id,
                        "late",
                        "Late",
                        "bg-warning text-white border-warning",
                      )}
                    </td>
                  </tr>
                ))}
                {students.length === 0 && (
                  <tr>
                    <td
                      colSpan="2"
                      className="py-12 text-center text-slate-400"
                    >
                      No students in this class.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {students.length > 0 && (
            <div className="p-6 border-t">
              <button
                onClick={save}
                disabled={saving}
                className="bg-teal text-white px-6 py-2 rounded-lg hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save attendance"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
