import { useEffect, useState } from "react";
import { Plus, Trash2, KeyRound, X } from "lucide-react";
import api from "../api";
import Modal from "../components/Modal";
import { useToast, useConfirm } from "../components/Feedback";

export default function Accountants() {
  const toast = useToast();
  const confirm = useConfirm();
  const [list, setList] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [resetting, setResetting] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const load = async () => {
    try {
      const r = await api.get("/users");
      setList(r.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load accountants", "error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/users", form);
      toast("Accountant added");
      setForm({ email: "", password: "" });
      setShowForm(false);
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not add the accountant",
        "error",
      );
    }
  };

  const reset = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/users/${resetting.id}/password`, {
        new_password: newPassword,
      });
      toast("Password reset");
      setResetting(null);
      setNewPassword("");
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not reset the password",
        "error",
      );
    }
  };

  const remove = async (u) => {
    const ok = await confirm({
      title: "Delete accountant?",
      message: `${u.email} will no longer be able to log in. Payments they recorded stay in the records.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast("Accountant deleted");
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not delete the accountant",
        "error",
      );
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex items-center justify-between border-b">
        <p className="text-sm text-slate-500">
          {list.length} accountant{list.length === 1 ? "" : "s"}
        </p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
        >
          {showForm ? <X size={18} /> : <Plus size={18} />}{" "}
          {showForm ? "Cancel" : "Add Accountant"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={add}
          className="grid sm:grid-cols-3 gap-4 p-4 sm:p-6 border-b bg-slate-50"
        >
          <input
            type="email"
            placeholder="Email (login)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
            required
          />
          <input
            type="password"
            minLength={8}
            placeholder="Password (8+ characters)"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={inputClass}
            required
          />
          <button
            type="submit"
            className="bg-teal text-white py-2 rounded-lg hover:opacity-90"
          >
            Save accountant
          </button>
        </form>
      )}

      <ul className="divide-y">
        {list.map((u) => (
          <li
            key={u.id}
            className="px-6 py-3 flex items-center justify-between hover:bg-slate-50"
          >
            <span className="font-medium">{u.email}</span>
            <div className="flex gap-1">
              <button
                onClick={() => setResetting(u)}
                className="p-2 rounded-lg hover:bg-slate-100 text-navy"
                title="Reset password"
              >
                <KeyRound size={16} />
              </button>
              <button
                onClick={() => remove(u)}
                className="p-2 rounded-lg hover:bg-red-50 text-danger"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
        {list.length === 0 && (
          <li className="py-12 text-center text-slate-400">
            No accountants yet.
          </li>
        )}
      </ul>

      {resetting && (
        <Modal
          title={`Reset password: ${resetting.email}`}
          onClose={() => setResetting(null)}
        >
          <form onSubmit={reset} className="space-y-4">
            <input
              type="text"
              minLength={8}
              placeholder="New password (8+ characters)"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
              required
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetting(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90"
              >
                Reset
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
