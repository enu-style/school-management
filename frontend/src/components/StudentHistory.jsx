import { useEffect, useState } from "react";
import api from "../api";

const labels = {
  enrolled: "Enrolled",
  promoted: "Promoted",
  repeated: "Repeated",
  graduated: "Graduated",
  withdrawn: "Withdrawn",
};

export default function StudentHistory({ studentId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    setError("");
    api
      .get(`/years/history/${studentId}`)
      .then((r) => setRows(r.data))
      .catch((err) =>
        setError(err.response?.data?.error || "Could not load the history"),
      );
  }, [studentId]);

  return (
    <div className="mt-6">
      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
        Academic history
      </p>
      {error && <p className="text-sm text-slate-400">{error}</p>}
      {!error && rows === null && (
        <p className="text-sm text-slate-400">Loading...</p>
      )}
      {rows && rows.length === 0 && (
        <p className="text-sm text-slate-400">No enrollment records yet.</p>
      )}
      {rows && rows.length > 0 && (
        <ul className="divide-y border rounded-lg">
          {rows.map((r, i) => (
            <li key={i} className="px-4 py-2 flex justify-between text-sm">
              <span className="font-medium">{r.year}</span>
              <span>
                {r.class_name ? `${r.class_name} - ${r.section}` : "-"}
              </span>
              <span className="text-slate-500">{labels[r.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
