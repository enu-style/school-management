import { useEffect, useState } from "react";
import {
  Plus,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Trash2,
  Zap,
} from "lucide-react";
import api from "../api";
import Modal from "../components/Modal";
import InvoiceDetail from "../components/InvoiceDetail";
import { useToast } from "../components/Feedback";
import { fmt, statusBadge } from "../utils/money";

const grades = Array.from({ length: 12 }, (_, i) => i + 1);
const statuses = ["unpaid", "partial", "paid", "overdue", "cancelled"];

export default function Invoices() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const [look, setLook] = useState(null);
  const [yearId, setYearId] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showGen, setShowGen] = useState(false);
  const [gen, setGen] = useState({ grade_no: "", due_date: "" });

  const [showNew, setShowNew] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [found, setFound] = useState([]);
  const [student, setStudent] = useState(null);
  const [items, setItems] = useState([{ description: "", amount: "" }]);
  const [dueDate, setDueDate] = useState("");
  const [newDiscount, setNewDiscount] = useState("");
  const [newReason, setNewReason] = useState("");

  const currency = look?.currency || "";

  const loadLookups = async (year) => {
    try {
      const r = await api.get("/fees/lookups", {
        params: year ? { year_id: year } : {},
      });
      setLook(r.data);
      if (!year) setYearId(String(r.data.year_id || ""));
    } catch (err) {
      toast(err.response?.data?.error || "Could not load the page", "error");
    }
  };

  const loadInvoices = async () => {
    if (!yearId) return;
    setLoading(true);
    try {
      const r = await api.get("/fees/invoices", {
        params: {
          year_id: yearId,
          class_id: classId || undefined,
          status: status || undefined,
          search: search || undefined,
          page,
        },
      });
      setData(r.data);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load invoices", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);
  useEffect(() => {
    loadInvoices();
  }, [yearId, classId, status, search, page]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (student || studentQuery.trim().length < 2) {
      setFound([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get("/fees/students", { params: { search: studentQuery } })
        .then((r) => setFound(r.data))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(t);
  }, [studentQuery, student]);

  const changeYear = (v) => {
    setYearId(v);
    setClassId("");
    setPage(1);
    loadLookups(v);
  };

  const generate = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post("/fees/invoices/generate", {
        year_id: yearId,
        grade_no: gen.grade_no || null,
        due_date: gen.due_date || null,
      });
      const d = r.data;
      toast(
        `${d.created} invoice(s) created, ${d.skipped_existing} already invoiced, ${d.no_structure} without fees set up`,
      );
      setShowGen(false);
      loadInvoices();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not generate invoices",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const setItem = (i, field, value) =>
    setItems(items.map((x, n) => (n === i ? { ...x, [field]: value } : x)));

  const closeNew = () => {
    setShowNew(false);
    setStudent(null);
    setStudentQuery("");
    setItems([{ description: "", amount: "" }]);
    setDueDate("");
    setNewDiscount("");
    setNewReason("");
  };

  const createInvoice = async (e) => {
    e.preventDefault();
    if (!student) return toast("Choose a student", "error");
    setSaving(true);
    try {
      await api.post("/fees/invoices", {
        student_id: student.id,
        year_id: yearId,
        due_date: dueDate || null,
        items,
        discount: newDiscount || "0",
        discount_reason: newReason,
      });
      toast("Invoice created");
      closeNew();
      loadInvoices();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not create the invoice",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";
  const selectClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex flex-wrap items-center gap-3 border-b">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Student or invoice no."
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={yearId}
          onChange={(e) => changeYear(e.target.value)}
          className={selectClass}
        >
          {(look?.years || []).map((y) => (
            <option key={y.id} value={y.id}>
              {y.name} ({y.status})
            </option>
          ))}
        </select>
        <select
          value={classId}
          onChange={(e) => {
            setClassId(e.target.value);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="">All classes</option>
          {(look?.classes || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} - {c.section}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </select>
        <div className="ml-auto flex gap-3">
          <button
            onClick={() => setShowGen(true)}
            className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg"
          >
            <Zap size={16} /> Generate
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
          >
            <Plus size={18} /> New invoice
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">Invoice</th>
              <th>Student</th>
              <th>Class</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Due</th>
              <th>Status</th>
              <th className="pr-6 text-right">View</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="9" className="py-10 text-center text-slate-400">
                  <Loader2 className="animate-spin inline mr-2" size={18} />
                  Loading...
                </td>
              </tr>
            )}
            {!loading &&
              data.rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="pl-6 font-medium">{r.invoice_no}</td>
                  <td>{r.full_name}</td>
                  <td>
                    {r.class_name ? `${r.class_name} - ${r.section}` : "-"}
                  </td>
                  <td>{fmt(r.total)}</td>
                  <td>{fmt(r.paid)}</td>
                  <td
                    className={r.balance > 0 ? "text-danger font-medium" : ""}
                  >
                    {fmt(r.balance)}
                  </td>
                  <td className="text-sm">{r.due_date || "-"}</td>
                  <td>
                    <span
                      className={`px-2 py-1 rounded-full text-xs capitalize ${statusBadge[r.pay_status]}`}
                    >
                      {r.pay_status}
                    </span>
                  </td>
                  <td className="pr-6 text-right">
                    <button
                      onClick={() => setOpenId(r.id)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                      title="Open"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && data.rows.length === 0 && (
              <tr>
                <td colSpan="9" className="py-12 text-center text-slate-400">
                  No invoices. Set up fees, then click Generate.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-t text-sm text-slate-600">
        <span>
          {data.total} invoice{data.total === 1 ? "" : "s"}{" "}
          {currency && `(amounts in ${currency})`}
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-2 border rounded-lg disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            Page {page} of {data.pages}
          </span>
          <button
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
            className="p-2 border rounded-lg disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {openId && (
        <InvoiceDetail
          id={openId}
          currency={currency}
          isAdmin={isAdmin}
          onClose={() => setOpenId(null)}
          onChanged={loadInvoices}
        />
      )}

      {showGen && (
        <Modal title="Generate invoices" onClose={() => setShowGen(false)}>
          <form onSubmit={generate} className="space-y-4">
            <p className="text-sm text-slate-600">
              Creates one invoice for each active, enrolled student of the
              selected year, using the amounts in Fee Setup. Students who
              already have an invoice for this year are skipped.
            </p>
            <select
              value={gen.grade_no}
              onChange={(e) => setGen({ ...gen, grade_no: e.target.value })}
              className={inputClass}
            >
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
            <label className="block text-sm">
              Due date (optional)
              <input
                type="date"
                value={gen.due_date}
                onChange={(e) => setGen({ ...gen, due_date: e.target.value })}
                className={`${inputClass} mt-1`}
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowGen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Generating..." : "Generate"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showNew && (
        <Modal title="New invoice" onClose={closeNew} wide>
          <form onSubmit={createInvoice} className="space-y-4">
            {student ? (
              <div className="flex items-center justify-between bg-slate-50 border rounded-lg px-4 py-2">
                <span className="font-medium">
                  {student.full_name}{" "}
                  <span className="text-slate-400 text-sm">
                    {student.class_name
                      ? `(${student.class_name} - ${student.section})`
                      : ""}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setStudent(null)}
                  className="text-sm text-teal hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search a student by name (2+ letters)"
                  className={inputClass}
                />
                {found.length > 0 && (
                  <ul className="border rounded-lg mt-1 divide-y max-h-48 overflow-y-auto">
                    {found.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setStudent(s);
                            setFound([]);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-slate-50"
                        >
                          {s.full_name}{" "}
                          <span className="text-slate-400 text-sm">
                            {s.class_name
                              ? `(${s.class_name} - ${s.section})`
                              : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-400">
                Items
              </p>
              {items.map((it, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={it.description}
                    onChange={(e) => setItem(i, "description", e.target.value)}
                    placeholder="Description"
                    className={inputClass}
                    required
                  />
                  <input
                    value={it.amount}
                    onChange={(e) => setItem(i, "amount", e.target.value)}
                    placeholder="Amount"
                    className="border border-slate-300 rounded-lg px-3 py-2 w-32"
                    required
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, n) => n !== i))}
                      className="p-2 text-danger hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setItems([...items, { description: "", amount: "" }])
                }
                className="text-sm text-teal hover:underline"
              >
                + Add item
              </button>
            </div>

            <label className="block text-sm">
              Due date (optional)
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>

            {isAdmin && (
              <div className="grid sm:grid-cols-2 gap-3">
                <input
                  value={newDiscount}
                  onChange={(e) => setNewDiscount(e.target.value)}
                  placeholder="Discount (optional)"
                  className={inputClass}
                />
                <input
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Reason for the discount"
                  className={inputClass}
                />
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={closeNew}
                className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Create invoice"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
