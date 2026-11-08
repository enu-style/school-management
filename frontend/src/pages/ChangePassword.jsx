import { useState } from "react";
import api from "../api";
import { useToast } from "../components/Feedback";

export default function ChangePassword() {
  const toast = useToast();
  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm: "",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.new_password !== form.confirm)
      return toast("New passwords do not match", "error");
    setSaving(true);
    try {
      await api.post("/password/change", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      toast("Password changed successfully");
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      toast(err.response?.data?.error || "Could not change password", "error");
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full border border-slate-300 rounded-lg px-3 py-2";

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-md space-y-4"
    >
      <input
        name="current_password"
        type="password"
        placeholder="Current password"
        value={form.current_password}
        onChange={handleChange}
        className={inputClass}
        required
      />
      <input
        name="new_password"
        type="password"
        minLength={8}
        placeholder="New password (8+ characters)"
        value={form.new_password}
        onChange={handleChange}
        className={inputClass}
        required
      />
      <input
        name="confirm"
        type="password"
        placeholder="Confirm new password"
        value={form.confirm}
        onChange={handleChange}
        className={inputClass}
        required
      />
      <button
        type="submit"
        disabled={saving}
        className="bg-teal text-white px-6 py-2 rounded-lg hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Change password"}
      </button>
    </form>
  );
}
