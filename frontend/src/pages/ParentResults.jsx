import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api";
import MyResults from "./MyResults";

export default function ParentResults() {
  const [params] = useSearchParams();
  const [children, setChildren] = useState([]);
  const [id, setId] = useState(params.get("child") || "");
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/parent/children")
      .then((r) => {
        setChildren(r.data);
        if (!id && r.data.length === 1) setId(String(r.data[0].id));
      })
      .catch(() => setError("Could not load your children"));
  }, []);

  return (
    <div className="space-y-6">
      {error && (
        <p className="bg-red-100 text-red-700 p-3 rounded-lg">{error}</p>
      )}
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
        <select
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
        >
          <option value="">Select child</option>
          {children.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>
      {id ? (
        <MyResults studentId={id} key={id} />
      ) : (
        <p className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          Select a child to see grades and attendance.
        </p>
      )}
    </div>
  );
}
