import { useEffect, useState } from "react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

const lists = {
  student: "/students",
  teacher: "/teachers",
  guardian: "/guardians",
};

export default function ResetPassword() {
  const toast = useToast();
  const confirm = useConfirm();
  const [type, setType] = useState("student");
  const [people, setPeople] = useState([]);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setId("");
    setPeople([]);
    api
      .get(lists[type])
      .then((r) => setPeople(r.data))
      .catch(() => toast("Could not load the list", "error"));
  }, [type]);

  const submit = async (e) => {
    e.preventDefault();
    const person = people.find((p) => String(p.id) === String(id));
    const ok = await confirm({
      title: "Reset password?",
      message: `${person?.full_name || "This user"} will need the new password to log in.`,
      confirmText: "Reset",
    });
    if (!ok) return;
    try {
      await api.post("/password/reset", { type, id, new_password: password });
      toast("Password reset. Tell the person their new password.");
      setPassword("");
    } catch (err) {
      toast(err.response?.data?.error || "Could not reset password", "error");
    }
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <form
      onSubmit={submit}
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 max-w-md space-y-4"
    >
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className={inputClass}
      >
        <option value="student">Student</option>
        <option value="teacher">Teacher</option>
        <option value="guardian">Parent</option>
      </select>
      <select
        value={id}
        onChange={(e) => setId(e.target.value)}
        className={inputClass}
        required
      >
        <option value="">Select person</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name} ({p.email})
          </option>
        ))}
      </select>
      <input
        type="text"
        minLength={8}
        placeholder="New password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={inputClass}
        required
      />
      <button
        type="submit"
        className="bg-teal text-white px-6 py-2 rounded-lg hover:opacity-90"
      >
        Reset password
      </button>
    </form>
  );
}
