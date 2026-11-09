import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Award, ScrollText } from "lucide-react";
import api from "../api";

export default function ParentHome() {
  const [children, setChildren] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/parent/children")
      .then((r) => setChildren(r.data))
      .catch((err) =>
        setError(err.response?.data?.error || "Could not load your children"),
      );
  }, []);

  if (error)
    return <p className="bg-red-100 text-red-700 p-4 rounded-lg">{error}</p>;
  if (children === null) return <p className="text-slate-500">Loading...</p>;
  if (children.length === 0) {
    return (
      <p className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
        No children are linked to your account yet. Please contact the school
        office.
      </p>
    );
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {children.map((c) => (
        <div
          key={c.id}
          className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
        >
          <div className="flex items-center gap-4 mb-4">
            <span className="w-14 h-14 rounded-full bg-teal text-white flex items-center justify-center text-xl font-semibold">
              {c.full_name.charAt(0).toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-lg">{c.full_name}</p>
              <p className="text-sm text-slate-500">
                {c.class_name ? `${c.class_name} - ${c.section}` : "No class"} |{" "}
                <span className="capitalize">{c.relationship}</span>
              </p>
              {c.status !== "active" && (
                <p className="text-xs text-slate-400 capitalize">{c.status}</p>
              )}
            </div>
          </div>

          <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
            Attendance this academic year
          </p>
          <div className="grid grid-cols-3 gap-3 text-center mb-5">
            <div className="bg-green-50 rounded-lg p-3">
              <p className="text-xl font-bold text-success">{c.present}</p>
              <p className="text-xs text-slate-500">Present</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-xl font-bold text-danger">{c.absent}</p>
              <p className="text-xs text-slate-500">Absent</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3">
              <p className="text-xl font-bold text-amber-600">{c.late}</p>
              <p className="text-xs text-slate-500">Late</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to={`/child-results?child=${c.id}`}
              className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg text-sm"
            >
              <Award size={16} /> Results
            </Link>
            <Link
              to={`/report-card?child=${c.id}`}
              className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm"
            >
              <ScrollText size={16} /> Report card
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
