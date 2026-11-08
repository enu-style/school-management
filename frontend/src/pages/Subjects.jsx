import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

export default function Subjects() {
  const toast = useToast();
  const confirm = useConfirm();
  const [subjects, setSubjects] = useState([]);
  const [name, setName] = useState("");

  const load = async () => {
    try {
      const res = await api.get("/subjects");
      setSubjects(res.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load subjects", "error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post("/subjects", { name });
      setName("");
      toast("Subject added");
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not add subject", "error");
    }
  };

  const remove = async (s) => {
    const ok = await confirm({
      title: "Delete subject?",
      message: `${s.name} will be removed from every class it is assigned to.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/subjects/${s.id}`);
      toast("Subject deleted");
      load();
    } catch (err) {
      toast(err.response?.data?.error || "Could not delete subject", "error");
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <form onSubmit={add} className="p-4 sm:p-6 flex flex-wrap gap-3 border-b">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Subject name (e.g. Chemistry)"
          className="border border-slate-300 rounded-lg px-3 py-2 flex-1 min-w-[200px] max-w-sm"
          required
        />
        <button
          type="submit"
          className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
        >
          <Plus size={18} /> Add subject
        </button>
      </form>

      <ul className="divide-y">
        {subjects.map((s) => (
          <li
            key={s.id}
            className="px-6 py-3 flex items-center justify-between hover:bg-slate-50"
          >
            <span className="font-medium">{s.name}</span>
            <button
              onClick={() => remove(s)}
              className="p-2 rounded-lg hover:bg-red-50 text-danger"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </li>
        ))}
        {subjects.length === 0 && (
          <li className="py-12 text-center text-slate-400">No subjects yet.</li>
        )}
      </ul>
    </div>
  );
}
