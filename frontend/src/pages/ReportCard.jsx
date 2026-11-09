import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api";
import CardView from "../components/CardView";

export default function ReportCard() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isStudent = user.role === "student";
  const isParent = user.role === "parent";
  const [params] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [children, setChildren] = useState([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState(
    isParent ? params.get("child") || "" : "",
  );
  const [term, setTerm] = useState("Semester 1");
  const [card, setCard] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isStudent) return;
    if (isParent) {
      api
        .get("/parent/children")
        .then((r) => {
          setChildren(r.data);
          if (r.data.length === 1) setStudentId(String(r.data[0].id));
        })
        .catch(() => setError("Could not load your children"));
      return;
    }
    api
      .get("/attendance/classes")
      .then((r) => setClasses(r.data))
      .catch(() => setError("Could not load classes"));
    api
      .get("/students")
      .then((r) => setStudents(r.data))
      .catch(() => setError("Could not load students"));
  }, []);

  useEffect(() => {
    if (!isParent) setStudentId("");
  }, [classId]);

  useEffect(() => {
    setCard(null);
    setError("");
    let request = null;
    if (isStudent) request = api.get("/card/me", { params: { term } });
    else if (isParent && studentId)
      request = api.get(`/parent/children/${studentId}/card`, {
        params: { term },
      });
    else if (studentId)
      request = api.get("/card/student", {
        params: { student_id: studentId, term },
      });
    if (request) {
      request
        .then((r) => setCard(r.data))
        .catch((err) =>
          setError(
            err.response?.data?.error || "Could not load the report card",
          ),
        );
    }
  }, [studentId, term]);

  const classStudents = students.filter(
    (s) => String(s.class_id) === String(classId),
  );
  const inputClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div>
      <div className="print:hidden bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
        {error && (
          <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-3">{error}</p>
        )}
        <div className="flex flex-wrap gap-4">
          {isParent && (
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className={inputClass}
            >
              <option value="">Select child</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          )}
          {!isStudent && !isParent && (
            <>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className={inputClass}
              >
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} - {c.section}
                  </option>
                ))}
              </select>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className={inputClass}
                disabled={!classId}
              >
                <option value="">Select student</option>
                {classStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            className={inputClass}
          >
            <option>Semester 1</option>
            <option>Semester 2</option>
          </select>
          {card && !card.noClass && (
            <button
              onClick={() => window.print()}
              className="bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
            >
              Print / Save as PDF
            </button>
          )}
        </div>
      </div>

      {!card && !isStudent && !studentId && !error && (
        <p className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          {isParent
            ? "Select a child to see the report card."
            : "Select a class and a student."}
        </p>
      )}

      {card && card.noClass && (
        <p className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 text-slate-500">
          This student is not in a class yet.
        </p>
      )}

      {card && !card.noClass && <CardView card={card} />}
    </div>
  );
}
