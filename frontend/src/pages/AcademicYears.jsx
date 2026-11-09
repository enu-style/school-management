import { useEffect, useState } from "react";
import { Plus, Pencil, Power, Lock, X } from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

const empty = { name: "", start_date: "", end_date: "", copy_from: "" };
const badge = {
  active: "bg-green-100 text-success",
  upcoming: "bg-blue-100 text-blue-700",
  closed: "bg-slate-200 text-slate-600",
};

export default function AcademicYears() {
  const toast = useToast();
  const confirm = useConfirm();
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const r = await api.get("/years");
      setYears(r.data);
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not load academic years",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const changeName = (e) => {
    const name = e.target.value;
    const next = { ...form, name };
    const m = /^(\d{4})\/(\d{4})$/.exec(name);
    if (m && !form.start_date && !form.end_date) {
      next.start_date = `${m[1]}-09-01`;
      next.end_date = `${m[2]}-06-30`;
    }
    setForm(next);
  };

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/years", { ...form, copy_from: form.copy_from || null });
      toast("Academic year created");
      setForm(empty);
      setShowNew(false);
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not create the year", "error");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (y) => {
    const ok = await confirm({
      title: `Activate ${y.name}?`,
      message:
        "The current active year will be closed. Grades and attendance of a closed year become read-only.",
      confirmText: "Activate",
    });
    if (!ok) return;
    try {
      await api.post(`/years/${y.id}/activate`);
      toast(`${y.name} is now active`);
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not activate the year",
        "error",
      );
    }
  };

  const close = async (y) => {
    const ok = await confirm({
      title: `Close ${y.name}?`,
      message:
        "Its grades and attendance become read-only, and no year will be active until you activate one.",
      confirmText: "Close year",
    });
    if (!ok) return;
    try {
      await api.post(`/years/${y.id}/close`);
      toast(`${y.name} is closed`);
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not close the year", "error");
    }
  };

  const setSemester = (index, field, value) => {
    const semesters = editing.semesters.map((s, i) =>
      i === index ? { ...s, [field]: value } : s,
    );
    setEditing({ ...editing, semesters });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/years/${editing.id}`, {
        start_date: editing.start_date,
        end_date: editing.end_date,
        semesters: editing.semesters.map((s) => ({
          id: s.id,
          start_date: s.start_date,
          end_date: s.end_date,
        })),
      });
      toast("Dates updated");
      setEditing(null);
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not save the dates", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex items-center justify-between border-b">
        <p className="text-sm text-slate-500">
          {years.length} academic year{years.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowNew(!showNew)}
          className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
        >
          {showNew ? <X size={18} /> : <Plus size={18} />}
          {showNew ? "Cancel" : "New year"}
        </button>
      </div>

      {showNew && (
        <form
          onSubmit={create}
          className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 sm:p-6 border-b bg-slate-50"
        >
          <input
            placeholder="Name, e.g. 2027/2028"
            value={form.name}
            onChange={changeName}
            className={inputClass}
            required
          />
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className={inputClass}
            required
          />
          <input
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            className={inputClass}
            required
          />
          <select
            value={form.copy_from}
            onChange={(e) => setForm({ ...form, copy_from: e.target.value })}
            className={inputClass}
          >
            <option value="">Start empty</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                Copy classes from {y.name}
              </option>
            ))}
          </select>
          <p className="sm:col-span-2 lg:col-span-4 text-xs text-slate-500">
            Copying brings the classes, teacher assignments, and assessments of
            that year. Students and grades are not copied.
          </p>
          <button
            type="submit"
            disabled={saving}
            className="sm:col-span-2 lg:col-span-4 bg-teal text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create academic year"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">Year</th>
              <th>Dates</th>
              <th>Semesters</th>
              <th>Classes</th>
              <th>Students</th>
              <th>Status</th>
              <th className="pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="7" className="py-10 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading &&
              years.map((y) => (
                <tr key={y.id} className="border-b align-top">
                  <td className="pl-6 font-medium">{y.name}</td>
                  <td className="text-sm">
                    {y.start_date} to {y.end_date}
                  </td>
                  <td className="text-xs text-slate-600">
                    {y.semesters.map((s) => (
                      <div key={s.id}>
                        {s.name}: {s.start_date} to {s.end_date}
                      </div>
                    ))}
                  </td>
                  <td>{y.classes}</td>
                  <td>{y.students}</td>
                  <td>
                    <span
                      className={`px-2 py-1 rounded-full text-xs capitalize ${badge[y.status]}`}
                    >
                      {y.status}
                    </span>
                  </td>
                  <td className="pr-6">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() =>
                          setEditing({
                            ...y,
                            semesters: y.semesters.map((s) => ({ ...s })),
                          })
                        }
                        className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                        title="Edit dates"
                      >
                        <Pencil size={16} />
                      </button>
                      {y.status !== "active" && (
                        <button
                          onClick={() => activate(y)}
                          className="p-2 rounded-lg hover:bg-slate-100 text-success"
                          title="Activate"
                        >
                          <Power size={16} />
                        </button>
                      )}
                      {y.status === "active" && (
                        <button
                          onClick={() => close(y)}
                          className="p-2 rounded-lg hover:bg-red-50 text-danger"
                          title="Close year"
                        >
                          <Lock size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {!loading && years.length === 0 && (
              <tr>
                <td colSpan="7" className="py-12 text-center text-slate-400">
                  No academic years yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setEditing(null)}
        >
          <form
            onSubmit={saveEdit}
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-semibold">Edit {editing.name}</h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <p className="col-span-2 text-xs uppercase tracking-wide text-slate-400">
                Academic year
              </p>
              <input
                type="date"
                value={editing.start_date}
                onChange={(e) =>
                  setEditing({ ...editing, start_date: e.target.value })
                }
                className={inputClass}
                required
              />
              <input
                type="date"
                value={editing.end_date}
                onChange={(e) =>
                  setEditing({ ...editing, end_date: e.target.value })
                }
                className={inputClass}
                required
              />
              {editing.semesters.map((s, i) => (
                <div key={s.id} className="col-span-2 grid grid-cols-2 gap-4">
                  <p className="col-span-2 text-xs uppercase tracking-wide text-slate-400">
                    {s.name}
                  </p>
                  <input
                    type="date"
                    value={s.start_date}
                    onChange={(e) =>
                      setSemester(i, "start_date", e.target.value)
                    }
                    className={inputClass}
                    required
                  />
                  <input
                    type="date"
                    value={s.end_date}
                    onChange={(e) => setSemester(i, "end_date", e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              ))}
              <div className="col-span-2 flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
