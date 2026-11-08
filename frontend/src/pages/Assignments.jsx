import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

export default function Assignments() {
  const toast = useToast();
  const confirm = useConfirm();
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [form, setForm] = useState({
    class_id: "",
    subject_id: "",
    teacher_id: "",
  });

  const loadAll = async () => {
    try {
      const [c, s, t, a] = await Promise.all([
        api.get("/classes"),
        api.get("/subjects"),
        api.get("/teachers"),
        api.get("/assignments"),
      ]);
      setClasses(c.data);
      setSubjects(s.data);
      setTeachers(t.data);
      setAssignments(a.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load data", "error");
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleChange = (e) =>
    setForm({ ...form, [e.target.name]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    try {
      await api.post("/assignments", form);
      toast("Assignment saved");
      loadAll();
    } catch (err) {
      toast(err.response?.data?.error || "Could not save assignment", "error");
    }
  };

  const remove = async (a) => {
    const ok = await confirm({
      title: "Remove assignment?",
      message: `${a.teacher_name || "The teacher"} will no longer teach ${a.subject_name} in ${a.class_name} - ${a.section}.`,
      confirmText: "Remove",
    });
    if (!ok) return;
    try {
      await api.delete(`/assignments/${a.id}`);
      toast("Assignment removed");
      loadAll();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not remove assignment",
        "error",
      );
    }
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <form
        onSubmit={save}
        className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 sm:p-6 border-b bg-slate-50"
      >
        <select
          name="class_id"
          value={form.class_id}
          onChange={handleChange}
          className={inputClass}
          required
        >
          <option value="">Select class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} - {c.section}
            </option>
          ))}
        </select>
        <select
          name="subject_id"
          value={form.subject_id}
          onChange={handleChange}
          className={inputClass}
          required
        >
          <option value="">Select subject</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          name="teacher_id"
          value={form.teacher_id}
          onChange={handleChange}
          className={inputClass}
          required
        >
          <option value="">Select teacher</option>
          {teachers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-teal text-white py-2 rounded-lg hover:opacity-90"
        >
          Assign
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">Class</th>
              <th>Subject</th>
              <th>Teacher</th>
              <th className="pr-6 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-b">
                <td className="pl-6">
                  {a.class_name} - {a.section}
                </td>
                <td>{a.subject_name}</td>
                <td>{a.teacher_name || "-"}</td>
                <td className="pr-6 text-right">
                  <button
                    onClick={() => remove(a)}
                    className="p-2 rounded-lg hover:bg-red-50 text-danger"
                    title="Remove"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan="4" className="py-12 text-center text-slate-400">
                  No assignments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
