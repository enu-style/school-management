import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, Zap } from "lucide-react";
import api from "../api";
import Modal from "../components/Modal";
import { useToast, useConfirm } from "../components/Feedback";

export default function TimetableSetup() {
  const toast = useToast();
  const confirm = useConfirm();
  const [periods, setPeriods] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [gen, setGen] = useState({
    start_time: "08:00",
    lesson_minutes: "40",
    lessons: "8",
    breaks: [
      { after: "3", minutes: "20" },
      { after: "5", minutes: "40" },
    ],
  });
  const [editP, setEditP] = useState(null);
  const [roomForm, setRoomForm] = useState({ name: "", capacity: "" });
  const [editR, setEditR] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [p, r] = await Promise.all([
        api.get("/timetable/periods"),
        api.get("/timetable/classrooms"),
      ]);
      setPeriods(p.data);
      setRooms(r.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load the setup", "error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setBreak = (i, field, value) =>
    setGen({
      ...gen,
      breaks: gen.breaks.map((b, n) =>
        n === i ? { ...b, [field]: value } : b,
      ),
    });

  const generate = async (e) => {
    e.preventDefault();
    if (periods.length > 0) {
      const ok = await confirm({
        title: "Rebuild the school day?",
        message:
          "The current periods will be replaced. This only works while no lessons are scheduled.",
        confirmText: "Rebuild",
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await api.post("/timetable/periods/generate", gen);
      toast("School day created");
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not create the school day",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const savePeriod = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/timetable/periods/${editP.id}`, editP);
      toast("Period updated");
      setEditP(null);
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not update the period",
        "error",
      );
    }
  };

  const removePeriod = async (p) => {
    const ok = await confirm({
      title: "Delete period?",
      message: `${p.name} (${p.start_time} - ${p.end_time}) will be removed.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/timetable/periods/${p.id}`);
      toast("Period deleted");
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not delete the period",
        "error",
      );
    }
  };

  const addRoom = async (e) => {
    e.preventDefault();
    try {
      await api.post("/timetable/classrooms", roomForm);
      setRoomForm({ name: "", capacity: "" });
      toast("Classroom added");
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not add the classroom",
        "error",
      );
    }
  };

  const saveRoom = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/timetable/classrooms/${editR.id}`, editR);
      toast("Classroom updated");
      setEditR(null);
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not update the classroom",
        "error",
      );
    }
  };

  const removeRoom = async (r) => {
    const ok = await confirm({
      title: "Delete classroom?",
      message: `${r.name} will be deleted. A room used in the timetable can only be deactivated.`,
    });
    if (!ok) return;
    try {
      await api.delete(`/timetable/classrooms/${r.id}`);
      toast("Classroom deleted");
      load();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not delete the classroom",
        "error",
      );
    }
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";
  const card = "bg-white rounded-xl shadow-sm border border-slate-200";

  return (
    <div className="space-y-6">
      <form onSubmit={generate} className={`${card} p-4 sm:p-6 space-y-4`}>
        <h2 className="font-semibold">Build the school day</h2>
        <p className="text-sm text-slate-500">
          Set the first lesson, how long a lesson lasts, and where the breaks
          go. You can edit any period afterwards.
        </p>
        <div className="grid sm:grid-cols-3 gap-4">
          <label className="text-sm">
            First lesson starts
            <input
              type="time"
              value={gen.start_time}
              onChange={(e) => setGen({ ...gen, start_time: e.target.value })}
              className={`${inputClass} mt-1`}
              required
            />
          </label>
          <label className="text-sm">
            Lesson length (minutes)
            <input
              type="number"
              min="20"
              max="120"
              value={gen.lesson_minutes}
              onChange={(e) =>
                setGen({ ...gen, lesson_minutes: e.target.value })
              }
              className={`${inputClass} mt-1`}
              required
            />
          </label>
          <label className="text-sm">
            Number of lessons
            <input
              type="number"
              min="1"
              max="12"
              value={gen.lessons}
              onChange={(e) => setGen({ ...gen, lessons: e.target.value })}
              className={`${inputClass} mt-1`}
              required
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Breaks
          </p>
          {gen.breaks.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span>After lesson</span>
              <input
                type="number"
                min="1"
                value={b.after}
                onChange={(e) => setBreak(i, "after", e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 w-20"
              />
              <span>for</span>
              <input
                type="number"
                min="5"
                max="90"
                value={b.minutes}
                onChange={(e) => setBreak(i, "minutes", e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1 w-20"
              />
              <span>minutes</span>
              <button
                type="button"
                onClick={() =>
                  setGen({
                    ...gen,
                    breaks: gen.breaks.filter((_, n) => n !== i),
                  })
                }
                className="p-1 text-danger hover:bg-red-50 rounded"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setGen({
                ...gen,
                breaks: [...gen.breaks, { after: "", minutes: "15" }],
              })
            }
            className="text-sm text-teal hover:underline"
          >
            + Add break
          </button>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-5 py-2 rounded-lg disabled:opacity-60"
        >
          <Zap size={16} /> {busy ? "Creating..." : "Create school day"}
        </button>
      </form>

      <div className={card}>
        <div className="px-6 py-4 border-b font-semibold">Periods</div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="pl-6">Name</th>
                <th>Start</th>
                <th>End</th>
                <th>Type</th>
                <th className="pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="pl-6 font-medium">{p.name}</td>
                  <td>{p.start_time}</td>
                  <td>{p.end_time}</td>
                  <td>
                    {p.is_break ? (
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-200">
                        Break
                      </span>
                    ) : (
                      "Lesson"
                    )}
                  </td>
                  <td className="pr-6">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditP({ ...p })}
                        className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                        title="Edit"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => removePeriod(p)}
                        className="p-2 rounded-lg hover:bg-red-50 text-danger"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {periods.length === 0 && (
                <tr>
                  <td colSpan="5" className="py-10 text-center text-slate-400">
                    No periods yet. Create the school day above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className={card}>
        <div className="px-6 py-4 border-b font-semibold">Classrooms</div>
        <form
          onSubmit={addRoom}
          className="p-4 sm:p-6 flex flex-wrap gap-3 border-b bg-slate-50"
        >
          <input
            value={roomForm.name}
            onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })}
            placeholder="Name, e.g. Room 101"
            className="border border-slate-300 rounded-lg px-3 py-2 flex-1 min-w-[160px] max-w-xs"
            required
          />
          <input
            type="number"
            min="1"
            max="500"
            value={roomForm.capacity}
            onChange={(e) =>
              setRoomForm({ ...roomForm, capacity: e.target.value })
            }
            placeholder="Capacity (optional)"
            className="border border-slate-300 rounded-lg px-3 py-2 w-48"
          />
          <button
            type="submit"
            className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
          >
            <Plus size={16} /> Add
          </button>
        </form>
        <ul className="divide-y">
          {rooms.map((r) => (
            <li
              key={r.id}
              className="px-6 py-3 flex items-center justify-between hover:bg-slate-50"
            >
              <span>
                <span className="font-medium">{r.name}</span>
                <span className="text-sm text-slate-500">
                  {" "}
                  {r.capacity ? `holds ${r.capacity}` : "no capacity set"}
                </span>
                {!r.active && (
                  <span className="ml-2 text-xs px-2 py-1 rounded-full bg-slate-200 text-slate-600">
                    Inactive
                  </span>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditR({ ...r, capacity: r.capacity ?? "" })}
                  className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                  title="Edit"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => removeRoom(r)}
                  className="p-2 rounded-lg hover:bg-red-50 text-danger"
                  title="Delete"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
          {rooms.length === 0 && (
            <li className="py-10 text-center text-slate-400">
              No classrooms yet.
            </li>
          )}
        </ul>
      </div>

      {editP && (
        <Modal title="Edit period" onClose={() => setEditP(null)}>
          <form onSubmit={savePeriod} className="space-y-4">
            <input
              value={editP.name}
              onChange={(e) => setEditP({ ...editP, name: e.target.value })}
              className={inputClass}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <input
                type="time"
                value={editP.start_time}
                onChange={(e) =>
                  setEditP({ ...editP, start_time: e.target.value })
                }
                className={inputClass}
                required
              />
              <input
                type="time"
                value={editP.end_time}
                onChange={(e) =>
                  setEditP({ ...editP, end_time: e.target.value })
                }
                className={inputClass}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editP.is_break}
                onChange={(e) =>
                  setEditP({ ...editP, is_break: e.target.checked })
                }
              />{" "}
              This is a break (no lessons)
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditP(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editR && (
        <Modal title="Edit classroom" onClose={() => setEditR(null)}>
          <form onSubmit={saveRoom} className="space-y-4">
            <input
              value={editR.name}
              onChange={(e) => setEditR({ ...editR, name: e.target.value })}
              className={inputClass}
              required
            />
            <input
              type="number"
              min="1"
              max="500"
              value={editR.capacity}
              onChange={(e) => setEditR({ ...editR, capacity: e.target.value })}
              placeholder="Capacity (optional)"
              className={inputClass}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editR.active}
                onChange={(e) =>
                  setEditR({ ...editR, active: e.target.checked })
                }
              />{" "}
              Active (can be chosen for new lessons)
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditR(null)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90"
              >
                Save
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
