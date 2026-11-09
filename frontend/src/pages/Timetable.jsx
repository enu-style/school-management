import { useEffect, useState } from "react";
import api from "../api";
import TimetableGrid from "../components/TimetableGrid";
import Modal from "../components/Modal";
import { useToast, useConfirm } from "../components/Feedback";

const ALL_DAYS = [
  { n: 1, label: "Monday" },
  { n: 2, label: "Tuesday" },
  { n: 3, label: "Wednesday" },
  { n: 4, label: "Thursday" },
  { n: 5, label: "Friday" },
  { n: 6, label: "Saturday" },
];

export default function Timetable() {
  const role = JSON.parse(localStorage.getItem("user") || "{}").role;
  const toast = useToast();
  const confirm = useConfirm();

  const [periods, setPeriods] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [children, setChildren] = useState([]);
  const [mode, setMode] = useState(role === "teacher" ? "my" : "class");
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [childId, setChildId] = useState("");
  const [grid, setGrid] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSat, setShowSat] = useState(false);
  const [cell, setCell] = useState(null);
  const [options, setOptions] = useState(null);
  const [form, setForm] = useState({ subject_id: "", classroom_id: "" });
  const [saving, setSaving] = useState(false);

  const modes =
    role === "admin"
      ? [
          ["class", "By class"],
          ["teacher", "By teacher"],
        ]
      : role === "teacher"
        ? [
            ["my", "My timetable"],
            ["class", "By class"],
          ]
        : [];

  useEffect(() => {
    api
      .get("/timetable/periods")
      .then((r) => setPeriods(r.data))
      .catch(() => toast("Could not load the periods", "error"));
    if (role === "admin" || role === "teacher") {
      api
        .get("/classes")
        .then((r) => setClasses(r.data))
        .catch(() => toast("Could not load classes", "error"));
    }
    if (role === "admin") {
      api
        .get("/teachers")
        .then((r) => setTeachers(r.data))
        .catch(() => toast("Could not load teachers", "error"));
    }
    if (role === "parent") {
      api
        .get("/parent/children")
        .then((r) => {
          setChildren(r.data);
          if (r.data.length === 1) setChildId(String(r.data[0].id));
        })
        .catch(() => toast("Could not load your children", "error"));
    }
  }, []);

  const loadGrid = async () => {
    let url = null;
    if (role === "student") url = "/timetable/me";
    else if (role === "parent")
      url = childId ? `/timetable/for-student/${childId}` : null;
    else if (mode === "my") url = "/timetable/my";
    else if (mode === "class")
      url = classId ? `/timetable/class/${classId}` : null;
    else if (mode === "teacher")
      url = teacherId ? `/timetable/teacher/${teacherId}` : null;

    if (!url) {
      setGrid(null);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(url);
      setGrid(r.data);
      if (r.data.entries.some((e) => e.day === 6)) setShowSat(true);
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not load the timetable",
        "error",
      );
      setGrid(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrid();
  }, [role, mode, classId, teacherId, childId]);

  const editable =
    role === "admin" && mode === "class" && !!classId && !!grid && !grid.closed;
  const kind = mode === "my" || mode === "teacher" ? "teacher" : "class";
  const days = showSat ? ALL_DAYS : ALL_DAYS.slice(0, 5);
  const prompt =
    role === "parent"
      ? "Select a child to see the timetable."
      : mode === "class"
        ? "Select a class to see its timetable."
        : mode === "teacher"
          ? "Select a teacher to see their timetable."
          : "";

  const openCell = async (day, period, entry) => {
    setCell({ day, period, entry });
    setOptions(null);
    setForm({
      subject_id: entry ? String(entry.subject_id) : "",
      classroom_id: entry?.classroom_id ? String(entry.classroom_id) : "",
    });
    try {
      const r = await api.get(`/timetable/class/${classId}/options`);
      setOptions(r.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load the options", "error");
      setCell(null);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/timetable/entries", {
        class_id: classId,
        day: cell.day,
        period_id: cell.period.id,
        subject_id: form.subject_id,
        classroom_id: form.classroom_id || null,
      });
      toast("Lesson saved");
      setCell(null);
      loadGrid();
    } catch (err) {
      toast(err.response?.data?.error || "Could not save the lesson", "error");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    const ok = await confirm({
      title: "Remove this lesson?",
      message: `${cell.entry.subject} on ${ALL_DAYS[cell.day - 1].label}, ${cell.period.name} will be removed from the timetable.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    try {
      await api.delete(`/timetable/entries/${cell.entry.id}`);
      toast("Lesson removed");
      setCell(null);
      loadGrid();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not remove the lesson",
        "error",
      );
    }
  };

  const inputClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="space-y-6">
      <div className="print:hidden bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        {modes.length > 0 && (
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {modes.map(([k, label]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`px-4 py-2 text-sm ${mode === k ? "bg-navy text-white" : "bg-white hover:bg-slate-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {role === "parent" && (
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select child</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        )}

        {(role === "admin" || role === "teacher") && mode === "class" && (
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
        )}

        {role === "admin" && mode === "teacher" && (
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select teacher</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showSat}
            onChange={(e) => setShowSat(e.target.checked)}
          />{" "}
          Show Saturday
        </label>

        {grid && (
          <button
            onClick={() => window.print()}
            className="ml-auto bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
          >
            Print / Save as PDF
          </button>
        )}
      </div>

      {loading && <p className="text-slate-500">Loading...</p>}

      {!grid && !loading && prompt && (
        <p className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          {prompt}
        </p>
      )}

      {grid && (
        <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
          <h2 className="font-semibold mb-1">{grid.title}</h2>
          {grid.closed && (
            <p className="text-xs text-slate-500 mb-3">
              This academic year is closed. The timetable is read-only.
            </p>
          )}
          {editable && (
            <p className="text-xs text-slate-500 mb-3 print:hidden">
              Click a cell to set or change a lesson.
            </p>
          )}
          {periods.length === 0 ? (
            <p className="text-slate-400 py-8 text-center">
              No lesson periods yet. The admin sets them in Timetable Setup.
            </p>
          ) : (
            <TimetableGrid
              periods={periods}
              days={days}
              entries={grid.entries}
              kind={kind}
              onCell={editable ? openCell : undefined}
            />
          )}
        </div>
      )}

      {cell && (
        <Modal
          title={`${ALL_DAYS[cell.day - 1].label}, ${cell.period.name} (${cell.period.start_time} - ${cell.period.end_time})`}
          onClose={() => setCell(null)}
        >
          {!options ? (
            <p className="text-slate-400">Loading...</p>
          ) : (
            <form onSubmit={save} className="space-y-4">
              <select
                value={form.subject_id}
                onChange={(e) =>
                  setForm({ ...form, subject_id: e.target.value })
                }
                className={`${inputClass} w-full`}
                required
              >
                <option value="">Select subject</option>
                {options.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.teacher || "no teacher assigned"})
                  </option>
                ))}
              </select>
              {options.subjects.length === 0 && (
                <p className="text-sm text-danger">
                  No subjects are assigned to this class. Add them in
                  Assignments first.
                </p>
              )}
              <select
                value={form.classroom_id}
                onChange={(e) =>
                  setForm({ ...form, classroom_id: e.target.value })
                }
                className={`${inputClass} w-full`}
              >
                <option value="">No classroom</option>
                {options.classrooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.capacity ? ` (holds ${r.capacity})` : ""}
                  </option>
                ))}
              </select>
              <div className="flex flex-wrap justify-between gap-3">
                {cell.entry ? (
                  <button
                    type="button"
                    onClick={clear}
                    className="px-4 py-2 rounded-lg border border-red-300 text-danger hover:bg-red-50"
                  >
                    Remove lesson
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setCell(null)}
                    className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Saving..." : "Save lesson"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
