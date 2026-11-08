import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

const emptyForm = { full_name: "", email: "", password: "", phone: "" };

export default function Teachers() {
  const toast = useToast();
  const confirm = useConfirm();
  const [teachers, setTeachers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    try {
      const res = await api.get("/teachers");
      setTeachers(res.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load teachers", "error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({ ...emptyForm, full_name: t.full_name, phone: t.phone || "" });
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/teachers/${editingId}`, {
          full_name: form.full_name,
          phone: form.phone,
        });
        toast("Teacher updated");
      } else {
        await api.post("/teachers", form);
        toast("Teacher added");
      }
      closeForm();
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not save teacher", "error");
    }
  };

  const remove = async (t) => {
    const ok = await confirm({
      title: "Delete teacher?",
      message: `${t.full_name} and their login account will be deleted.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/teachers/${t.id}`);
      toast("Teacher deleted");
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not delete teacher", "error");
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex items-center justify-between border-b">
        <p className="text-sm text-slate-500">
          {teachers.length} teacher{teachers.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={showForm ? closeForm : () => setShowForm(true)}
          className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}
          {showForm ? "Cancel" : "Add Teacher"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={save}
          className="grid sm:grid-cols-2 gap-4 p-4 sm:p-6 border-b bg-slate-50"
        >
          <input
            name="full_name"
            placeholder="Full name"
            value={form.full_name}
            onChange={handleChange}
            className={inputClass}
            required
          />
          <input
            name="phone"
            placeholder="Phone"
            value={form.phone}
            onChange={handleChange}
            className={inputClass}
          />
          {!editingId && (
            <>
              <input
                name="email"
                type="email"
                placeholder="Email (login)"
                value={form.email}
                onChange={handleChange}
                className={inputClass}
                required
              />
              <input
                name="password"
                type="password"
                minLength={8}
                placeholder="Password (8+ characters)"
                value={form.password}
                onChange={handleChange}
                className={inputClass}
                required
              />
            </>
          )}
          <button
            type="submit"
            className="sm:col-span-2 bg-teal text-white py-2 rounded-lg hover:opacity-90"
          >
            {editingId ? "Update teacher" : "Save teacher"}
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th className="pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b">
                <td className="pl-6">
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-full bg-navy text-white flex items-center justify-center font-semibold">
                      {t.full_name.charAt(0).toUpperCase()}
                    </span>
                    <span className="font-medium">{t.full_name}</span>
                  </div>
                </td>
                <td>{t.phone || "-"}</td>
                <td className="text-slate-600">{t.email}</td>
                <td className="pr-6">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => openEdit(t)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => remove(t)}
                      className="p-2 rounded-lg hover:bg-red-50 text-danger"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {teachers.length === 0 && (
              <tr>
                <td colSpan="4" className="py-12 text-center text-slate-400">
                  No teachers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
