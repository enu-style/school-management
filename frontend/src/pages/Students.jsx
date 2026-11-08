import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Loader2,
} from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

const emptyForm = {
  full_name: "",
  email: "",
  password: "",
  gender: "male",
  date_of_birth: "",
  class_id: "",
};
const PAGE_SIZE = 10;

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function Students() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const confirm = useConfirm();

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [asc, setAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = async (term = "") => {
    try {
      const res = await api.get("/students", { params: { search: term } });
      setStudents(res.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load students", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api
      .get("/classes")
      .then((r) => setClasses(r.data))
      .catch(() => toast("Could not load classes", "error"));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [gradeFilter, sectionFilter, search]);

  const grades = [...new Set(classes.map((c) => c.name))];
  const sections = [...new Set(classes.map((c) => c.section))].sort();

  const filtered = useMemo(() => {
    const list = students.filter(
      (s) =>
        (!gradeFilter || s.class_name === gradeFilter) &&
        (!sectionFilter || s.section === sectionFilter),
    );
    list.sort(
      (a, b) => a.full_name.localeCompare(b.full_name) * (asc ? 1 : -1),
    );
    return list;
  }, [students, gradeFilter, sectionFilter, asc]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({
      ...emptyForm,
      full_name: s.full_name,
      gender: s.gender || "male",
      date_of_birth: s.date_of_birth || "",
      class_id: s.class_id || "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = {
      ...form,
      class_id: form.class_id || null,
      date_of_birth: form.date_of_birth || null,
    };
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, data);
        toast("Student updated");
      } else {
        await api.post("/students", data);
        toast("Student added");
      }
      closeForm();
      load(search);
    } catch (err) {
      toast(err.response?.data?.error || "Could not save student", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    const ok = await confirm({
      title: "Delete student?",
      message: `${s.full_name} and their login account will be deleted. This cannot be undone.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/students/${s.id}`);
      toast("Student deleted");
      load(search);
    } catch (err) {
      toast(err.response?.data?.error || "Could not delete student", "error");
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2";
  const selectClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex flex-wrap items-center gap-3 border-b">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          className={selectClass}
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s} value={s}>
              Section {s}
            </option>
          ))}
        </select>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="ml-auto flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
          >
            <Plus size={18} /> Add Student
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">
                <button
                  onClick={() => setAsc(!asc)}
                  className="flex items-center gap-1 uppercase"
                >
                  Student <ArrowUpDown size={14} />
                </button>
              </th>
              <th>Gender</th>
              <th>Class</th>
              <th>Email</th>
              <th className="pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="5" className="py-10 text-center text-slate-400">
                  <Loader2 className="animate-spin inline mr-2" size={18} />
                  Loading...
                </td>
              </tr>
            )}
            {!loading &&
              visible.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="pl-6">
                    <div className="flex items-center gap-3">
                      <span className="w-9 h-9 rounded-full bg-teal text-white flex items-center justify-center font-semibold">
                        {s.full_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="font-medium">{s.full_name}</span>
                    </div>
                  </td>
                  <td className="capitalize">{s.gender || "-"}</td>
                  <td>
                    {s.class_name ? (
                      `${s.class_name} - ${s.section}`
                    ) : (
                      <span className="text-slate-400">No class</span>
                    )}
                  </td>
                  <td className="text-slate-600">{s.email}</td>
                  <td className="pr-6">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setViewing(s)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                        title="View"
                      >
                        <Eye size={16} />
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            onClick={() => openEdit(s)}
                            className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => remove(s)}
                            className="p-2 rounded-lg hover:bg-red-50 text-danger"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan="5" className="py-12 text-center text-slate-400">
                  No students found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-t text-sm text-slate-600">
        <span>
          {filtered.length} student{filtered.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-2 border rounded-lg disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
            className="p-2 border rounded-lg disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {showForm && (
        <Modal
          title={editingId ? "Edit student" : "Add student"}
          onClose={closeForm}
        >
          <form onSubmit={save} className="grid sm:grid-cols-2 gap-4">
            <p className="sm:col-span-2 text-xs uppercase tracking-wide text-slate-400">
              Personal information
            </p>
            <Field label="Full name">
              <input
                name="full_name"
                value={form.full_name}
                onChange={handleChange}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Gender">
              <select
                name="gender"
                value={form.gender}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Date of birth">
              <input
                name="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={handleChange}
                className={inputClass}
              />
            </Field>

            <p className="sm:col-span-2 text-xs uppercase tracking-wide text-slate-400 mt-2">
              Academic information
            </p>
            <Field label="Class">
              <select
                name="class_id"
                value={form.class_id}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="">No class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.section} ({c.academic_year})
                  </option>
                ))}
              </select>
            </Field>

            {!editingId && (
              <>
                <p className="sm:col-span-2 text-xs uppercase tracking-wide text-slate-400 mt-2">
                  Login account
                </p>
                <Field label="Email">
                  <input
                    name="email"
                    type="email"
                    value={form.email}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  />
                </Field>
                <Field label="Password (8+ characters)">
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={handleChange}
                    className={inputClass}
                    required
                  />
                </Field>
              </>
            )}

            <div className="sm:col-span-2 flex justify-end gap-3 mt-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {editingId ? "Update student" : "Save student"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {viewing && (
        <Modal title="Student profile" onClose={() => setViewing(null)}>
          <div className="flex items-center gap-4 mb-6">
            <span className="w-16 h-16 rounded-full bg-teal text-white flex items-center justify-center text-2xl font-semibold">
              {viewing.full_name.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="text-lg font-semibold">{viewing.full_name}</p>
              <p className="text-slate-500">
                {viewing.class_name
                  ? `${viewing.class_name} - ${viewing.section}`
                  : "No class"}
              </p>
            </div>
          </div>
          <dl className="grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-400">Gender</dt>
              <dd className="capitalize">{viewing.gender || "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Date of birth</dt>
              <dd>{viewing.date_of_birth || "-"}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Login email</dt>
              <dd>{viewing.email}</dd>
            </div>
          </dl>
        </Modal>
      )}
    </div>
  );
}
