import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Link2, X } from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

const emptyForm = { full_name: "", phone: "", email: "", password: "" };
const relations = ["father", "mother", "guardian", "other"];

function Modal({ title, onClose, children }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
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

export default function Guardians() {
  const toast = useToast();
  const confirm = useConfirm();
  const [guardians, setGuardians] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [linking, setLinking] = useState(null);
  const [link, setLink] = useState({ student_id: "", relationship: "father" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [g, s] = await Promise.all([
        api.get("/guardians"),
        api.get("/students"),
      ]);
      setGuardians(g.data);
      setStudents(s.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load parents", "error");
    } finally {
      setLoading(false);
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

  const openEdit = (g) => {
    setEditingId(g.id);
    setForm({ ...emptyForm, full_name: g.full_name, phone: g.phone || "" });
    setShowForm(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put(`/guardians/${editingId}`, {
          full_name: form.full_name,
          phone: form.phone,
        });
        toast("Parent updated");
      } else {
        await api.post("/guardians", form);
        toast("Parent added. Now link their children.");
      }
      closeForm();
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not save the parent", "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (g) => {
    const ok = await confirm({
      title: "Delete parent?",
      message: `${g.full_name} and their login will be deleted. Their children stay in the system.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/guardians/${g.id}`);
      toast("Parent deleted");
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not delete the parent",
        "error",
      );
    }
  };

  const addLink = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/guardians/${linking.id}/children`, link);
      toast("Child linked");
      setLinking(null);
      setLink({ student_id: "", relationship: "father" });
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not link the child", "error");
    }
  };

  const unlink = async (g, child) => {
    const ok = await confirm({
      title: "Remove link?",
      message: `${g.full_name} will no longer see ${child.full_name}.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    try {
      await api.delete(`/guardians/${g.id}/children/${child.id}`);
      toast("Link removed");
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not remove the link", "error");
    }
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex items-center justify-between border-b">
        <p className="text-sm text-slate-500">
          {guardians.length} parent{guardians.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
        >
          <Plus size={18} /> Add Parent
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">Parent</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Children</th>
              <th className="pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="5" className="py-10 text-center text-slate-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading &&
              guardians.map((g) => (
                <tr key={g.id} className="border-b align-top">
                  <td className="pl-6 font-medium">{g.full_name}</td>
                  <td>{g.phone || "-"}</td>
                  <td className="text-slate-600">{g.email}</td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {g.children.map((c) => (
                        <span
                          key={c.id}
                          className="inline-flex items-center gap-1 bg-slate-100 rounded-full pl-3 pr-1 py-1 text-xs"
                        >
                          {c.full_name}{" "}
                          <span className="text-slate-400 capitalize">
                            ({c.relationship})
                          </span>
                          <button
                            onClick={() => unlink(g, c)}
                            className="p-1 rounded-full hover:bg-slate-200"
                            title="Remove link"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                      {g.children.length === 0 && (
                        <span className="text-xs text-slate-400">
                          No children linked
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="pr-6">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setLinking(g)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-navy"
                        title="Link a child"
                      >
                        <Link2 size={16} />
                      </button>
                      <button
                        onClick={() => openEdit(g)}
                        className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => remove(g)}
                        className="p-2 rounded-lg hover:bg-red-50 text-danger"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            {!loading && guardians.length === 0 && (
              <tr>
                <td colSpan="5" className="py-12 text-center text-slate-400">
                  No parents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal
          title={editingId ? "Edit parent" : "Add parent"}
          onClose={closeForm}
        >
          <form onSubmit={save} className="space-y-4">
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
            <div className="flex justify-end gap-3">
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
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-60"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update parent"
                    : "Save parent"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {linking && (
        <Modal
          title={`Link a child to ${linking.full_name}`}
          onClose={() => setLinking(null)}
        >
          <form onSubmit={addLink} className="space-y-4">
            <select
              value={link.student_id}
              onChange={(e) => setLink({ ...link, student_id: e.target.value })}
              className={inputClass}
              required
            >
              <option value="">Select student</option>
              {students
                .filter((s) => !linking.children.some((c) => c.id === s.id))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{" "}
                    {s.class_name ? `(${s.class_name} - ${s.section})` : ""}
                  </option>
                ))}
            </select>
            <select
              value={link.relationship}
              onChange={(e) =>
                setLink({ ...link, relationship: e.target.value })
              }
              className={inputClass}
            >
              {relations.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setLinking(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90"
              >
                Link child
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
