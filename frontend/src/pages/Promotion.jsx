import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "../api";
import { useToast, useConfirm } from "../components/Feedback";

const gradeList = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);

export default function Promotion() {
  const toast = useToast();
  const confirm = useConfirm();
  const [years, setYears] = useState([]);
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [grade, setGrade] = useState("");
  const [passMark, setPassMark] = useState(50);
  const [rows, setRows] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api
      .get("/years")
      .then((r) => {
        setYears(r.data);
        const active = r.data.find((y) => y.status === "active");
        const next = [...r.data].reverse().find((y) => y.status === "upcoming");
        if (active) setFromYear(String(active.id));
        if (next) setToYear(String(next.id));
      })
      .catch(() => toast("Could not load academic years", "error"));
  }, []);

  const preview = async () => {
    setLoading(true);
    setRows(null);
    try {
      const r = await api.get("/years/promotion/preview", {
        params: {
          from_year: fromYear,
          to_year: toYear,
          grade: grade || undefined,
          pass_mark: passMark,
        },
      });
      setRows(r.data.rows);
      const d = {};
      r.data.rows.forEach((x) => {
        d[x.student_id] = x.suggestion === "review" ? "skip" : x.suggestion;
      });
      setDecisions(d);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load the preview", "error");
    } finally {
      setLoading(false);
    }
  };

  const target = (r) => {
    const d = decisions[r.student_id];
    if (d === "promote") return r.promote_to;
    if (d === "repeat") return r.repeat_to;
    return null;
  };

  const needsTarget = (r) =>
    ["promote", "repeat"].includes(decisions[r.student_id]) && !target(r);
  const blocked = rows ? rows.some(needsTarget) : false;
  const count = (d) => Object.values(decisions).filter((x) => x === d).length;

  const apply = async () => {
    const list = rows
      .map((r) => ({
        student_id: r.student_id,
        decision: decisions[r.student_id],
      }))
      .filter((d) => d.decision !== "skip");
    if (list.length === 0)
      return toast("Nothing to apply. Every student is set to Skip.", "error");
    const ok = await confirm({
      title: "Apply promotion?",
      message: `${list.length} student(s) will move to the new year's classes. Their records from the old year stay unchanged.`,
      confirmText: "Apply",
    });
    if (!ok) return;
    setApplying(true);
    try {
      const r = await api.post("/years/promotion/apply", {
        from_year: fromYear,
        to_year: toYear,
        decisions: list,
      });
      toast(`${r.data.processed} student(s) processed`);
      preview();
    } catch (err) {
      toast(err.response?.data?.error || "Could not apply promotion", "error");
    } finally {
      setApplying(false);
    }
  };

  const inputClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <p className="text-sm text-slate-500 mb-4">
          Suggestions use each student's full-year result. A student is
          suggested for promotion only when every assessment of every subject is
          entered and the percentage reaches the pass mark.
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm">
            From year
            <select
              value={fromYear}
              onChange={(e) => setFromYear(e.target.value)}
              className={`${inputClass} block mt-1`}
            >
              <option value="">Select</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} ({y.status})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            To year
            <select
              value={toYear}
              onChange={(e) => setToYear(e.target.value)}
              className={`${inputClass} block mt-1`}
            >
              <option value="">Select</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name} ({y.status})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Grade
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className={`${inputClass} block mt-1`}
            >
              <option value="">All grades</option>
              {gradeList.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Pass mark (%)
            <input
              type="number"
              min="0"
              max="100"
              value={passMark}
              onChange={(e) => setPassMark(e.target.value)}
              className={`${inputClass} block mt-1 w-24`}
            />
          </label>
          <button
            onClick={preview}
            disabled={!fromYear || !toYear || loading}
            className="bg-navy hover:bg-navy-light text-white px-5 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />} Load
            students
          </button>
        </div>
      </div>

      {rows && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200">
          <div className="px-6 py-3 border-b text-sm text-slate-600 flex flex-wrap gap-4">
            <span>
              Promote: <b>{count("promote")}</b>
            </span>
            <span>
              Repeat: <b>{count("repeat")}</b>
            </span>
            <span>
              Graduate: <b>{count("graduate")}</b>
            </span>
            <span>
              Skip: <b>{count("skip")}</b>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="pl-6">Student</th>
                  <th>Class</th>
                  <th>Result</th>
                  <th>Suggested</th>
                  <th>Decision</th>
                  <th className="pr-6">Moves to</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} className="border-b">
                    <td className="pl-6 font-medium">{r.full_name}</td>
                    <td>{r.class_name}</td>
                    <td>
                      {r.percent === null ? (
                        <span className="text-xs text-slate-400">
                          Incomplete
                        </span>
                      ) : (
                        `${r.percent}%`
                      )}
                    </td>
                    <td className="capitalize text-slate-600">
                      {r.suggestion === "review"
                        ? "Needs review"
                        : r.suggestion}
                    </td>
                    <td>
                      <select
                        value={decisions[r.student_id]}
                        onChange={(e) =>
                          setDecisions({
                            ...decisions,
                            [r.student_id]: e.target.value,
                          })
                        }
                        className="border border-slate-300 rounded-lg px-2 py-1 bg-white"
                      >
                        <option value="promote">Promote</option>
                        <option value="repeat">Repeat</option>
                        <option value="graduate">Graduate</option>
                        <option value="skip">Skip</option>
                      </select>
                    </td>
                    <td className="pr-6 text-sm">
                      {needsTarget(r) && (
                        <span className="text-danger">
                          No class in the new year
                        </span>
                      )}
                      {!needsTarget(r) &&
                        decisions[r.student_id] === "graduate" &&
                        "Graduates"}
                      {!needsTarget(r) && target(r)}
                      {decisions[r.student_id] === "skip" && (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan="6"
                      className="py-12 text-center text-slate-400"
                    >
                      No students to promote for this selection.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {rows.length > 0 && (
            <div className="p-6 border-t flex items-center gap-4">
              <button
                onClick={apply}
                disabled={applying || blocked}
                className="bg-teal text-white px-6 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {applying ? "Applying..." : "Apply decisions"}
              </button>
              {blocked && (
                <p className="text-sm text-danger">
                  Some students have no class in the new year. Copy the classes
                  to the new year first, or set them to Skip.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
