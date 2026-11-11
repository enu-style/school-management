import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import api from "../api";
import Modal from "../components/Modal";
import { useToast, useConfirm } from "../components/Feedback";

const LETTER = /^[A-Z]$/;
const letters = (n) =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

const tone = (s) =>
  s.capacity && s.students > s.capacity
    ? "border-red-300 bg-red-50 text-danger"
    : s.capacity && s.students === s.capacity
      ? "border-amber-300 bg-amber-50 text-amber-700"
      : "border-slate-300 bg-white hover:bg-slate-50";

export default function Classes() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [yearId, setYearId] = useState("");
  const [copy, setCopy] = useState(true);
  const [counts, setCounts] = useState({});
  const [caps, setCaps] = useState({});
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (year) => {
    try {
      const r = await api.get("/classes/overview", {
        params: year ? { year_id: year } : {},
      });
      setData(r.data);
      setYearId(String(r.data.year?.id || ""));
      const c = {};
      r.data.grades.forEach((g) => {
        c[g.grade_no] = String(g.sections.length);
      });
      setCounts(c);
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not load the sections",
        "error",
      );
    }
  };

  useEffect(() => {
    load("");
  }, []);

  const run = async (fn) => {
    setBusy(true);
    try {
      toast(await fn());
      await load(yearId);
    } catch (err) {
      toast(err.response?.data?.error || "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  const readOnly = data?.year?.status === "closed";

  const applyCount = async (g) => {
    const n = Number(counts[g.grade_no]);
    if (!Number.isInteger(n) || n < 0 || n > 26)
      return toast("Use a whole number from 0 to 26", "error");
    const wanted = letters(n);
    const removing = g.sections.filter(
      (s) => LETTER.test(s.section) && !wanted.includes(s.section),
    );
    if (removing.length) {
      const ok = await confirm({
        title: `Remove ${removing.length} section${removing.length === 1 ? "" : "s"}?`,
        message: `Grade ${g.grade_no} ${removing.map((s) => s.section).join(", ")} will be removed, with their subject assignments and timetable lessons. A section that has students is never removed.`,
        confirmText: "Remove",
      });
      if (!ok) return;
    }
    run(async () => {
      const r = await api.put("/classes/grade-sections", {
        year_id: yearId,
        grade_no: g.grade_no,
        count: n,
        copy_subjects: copy,
      });
      const parts = [];
      if (r.data.added.length) parts.push(`added ${r.data.added.join(", ")}`);
      if (r.data.removed.length)
        parts.push(`removed ${r.data.removed.join(", ")}`);
      return parts.length
        ? `Grade ${g.grade_no}: ${parts.join(", ")}`
        : "Nothing to change";
    });
  };

  const addOne = (g) => {
    const next = letters(26).find(
      (l) => !g.sections.some((s) => s.section === l),
    );
    if (!next) return toast("All 26 letters are used", "error");
    run(async () => {
      await api.post("/classes", {
        year_id: yearId,
        grade_no: g.grade_no,
        section: next,
        copy_subjects: copy,
      });
      return `Added Grade ${g.grade_no} - ${next}`;
    });
  };

  const applyGradeCapacity = (g) =>
    run(async () => {
      const r = await api.put("/classes/capacity", {
        year_id: yearId,
        grade_no: g.grade_no,
        capacity: caps[g.grade_no] ?? "",
      });
      return `Capacity saved for ${r.data.updated} section(s)`;
    });

  const saveCapacity = async (e) => {
    e.preventDefault();
    await run(async () => {
      await api.put(`/classes/${edit.id}`, { capacity: edit.capacityInput });
      setEdit(null);
      return "Capacity saved";
    });
  };

  const removeOne = async () => {
    const ok = await confirm({
      title: "Remove this section?",
      message: `Grade ${edit.grade_no} - ${edit.section} will be removed${edit.subjects ? `, with its ${edit.subjects} subject assignment(s) and timetable lessons` : ""}.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    await run(async () => {
      await api.delete(`/classes/${edit.id}`);
      setEdit(null);
      return "Section removed";
    });
  };

  if (!data) return <p className="text-slate-500">Loading...</p>;

  const inputClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        <select
          value={yearId}
          onChange={(e) => load(e.target.value)}
          className={inputClass}
        >
          {data.years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name} ({y.status})
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={copy}
            onChange={(e) => setCopy(e.target.checked)}
          />
          Copy subjects and teachers into new sections
        </label>
        <p className="ml-auto text-sm text-slate-500">
          {data.totals.sections} sections, {data.totals.students} students
        </p>
      </div>

      <p className="text-xs text-slate-500">
        Click a section to set its capacity or remove it. Amber means full and
        red means over capacity. Capacity is a guide: it does not block adding
        students.
      </p>
      {readOnly && (
        <p className="bg-slate-100 rounded-lg p-3 text-sm">
          This academic year is closed. Sections are read-only.
        </p>
      )}

      {data.grades.map((g) => (
        <div
          key={g.grade_no}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-semibold">
              Grade {g.grade_no}{" "}
              <span className="text-sm font-normal text-slate-500">
                {g.sections.length} section{g.sections.length === 1 ? "" : "s"},{" "}
                {g.sections.reduce((a, s) => a + s.students, 0)} students
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-2">
                Sections
                <input
                  type="number"
                  min="0"
                  max="26"
                  disabled={readOnly || busy}
                  value={counts[g.grade_no] ?? ""}
                  onChange={(e) =>
                    setCounts({ ...counts, [g.grade_no]: e.target.value })
                  }
                  className="border border-slate-300 rounded-lg px-2 py-1 w-16"
                />
              </label>
              <button
                onClick={() => applyCount(g)}
                disabled={readOnly || busy}
                className="border border-slate-300 hover:bg-slate-50 px-3 py-1 rounded-lg disabled:opacity-50"
              >
                Apply
              </button>
              <button
                onClick={() => addOne(g)}
                disabled={readOnly || busy}
                className="flex items-center gap-1 bg-navy hover:bg-navy-light text-white px-3 py-1 rounded-lg disabled:opacity-50"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {g.sections.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  setEdit({
                    ...s,
                    grade_no: g.grade_no,
                    capacityInput: s.capacity ?? "",
                  })
                }
                className={`px-3 py-2 rounded-lg border text-left min-w-20 ${tone(s)}`}
              >
                <span className="font-semibold">{s.section}</span>
                <span className="block text-xs">
                  {s.students}
                  {s.capacity ? ` / ${s.capacity}` : ""} students
                </span>
              </button>
            ))}
            {g.sections.length === 0 && (
              <p className="text-sm text-slate-400">No sections yet.</p>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span>Capacity for every section of this grade</span>
            <input
              type="number"
              min="1"
              max="200"
              placeholder="no limit"
              disabled={readOnly || busy}
              value={caps[g.grade_no] ?? ""}
              onChange={(e) =>
                setCaps({ ...caps, [g.grade_no]: e.target.value })
              }
              className="border border-slate-300 rounded-lg px-2 py-1 w-24"
            />
            <button
              onClick={() => applyGradeCapacity(g)}
              disabled={readOnly || busy || g.sections.length === 0}
              className="border border-slate-300 hover:bg-slate-50 px-3 py-1 rounded-lg disabled:opacity-50"
            >
              Apply
            </button>
          </div>
        </div>
      ))}

      {edit && (
        <Modal
          title={`Grade ${edit.grade_no} - ${edit.section}`}
          onClose={() => setEdit(null)}
        >
          <form onSubmit={saveCapacity} className="space-y-4">
            <p className="text-sm text-slate-600">
              {edit.students} student{edit.students === 1 ? "" : "s"},{" "}
              {edit.subjects} subject assignment{edit.subjects === 1 ? "" : "s"}
            </p>
            <label className="block text-sm">
              Capacity (leave empty for no limit)
              <input
                type="number"
                min="1"
                max="200"
                disabled={readOnly}
                value={edit.capacityInput}
                onChange={(e) =>
                  setEdit({ ...edit, capacityInput: e.target.value })
                }
                className={`${inputClass} w-full mt-1`}
              />
            </label>
            <div className="flex flex-wrap justify-between gap-3">
              <button
                type="button"
                onClick={removeOne}
                disabled={readOnly || busy || edit.students > 0}
                title={edit.students > 0 ? "Move the students out first" : ""}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 text-danger hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 size={16} /> Remove section
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={readOnly || busy}
                  className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
