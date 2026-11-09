import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import api from "../api";
import { useToast } from "../components/Feedback";
import { fmt, methodLabel } from "../utils/money";

export default function Payments() {
  const toast = useToast();
  const navigate = useNavigate();
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [method, setMethod] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({
    rows: [],
    total: 0,
    pages: 1,
    collected: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/fees/lookups")
      .then((r) => setCurrency(r.data.currency))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setLoading(true);
    api
      .get("/fees/payments", {
        params: {
          from: from || undefined,
          to: to || undefined,
          method: method || undefined,
          search: search || undefined,
          page,
        },
      })
      .then((r) => setData(r.data))
      .catch((err) =>
        toast(err.response?.data?.error || "Could not load payments", "error"),
      )
      .finally(() => setLoading(false));
  }, [from, to, method, search, page]);

  const inputClass = "border border-slate-300 rounded-lg px-3 py-2 bg-white";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="p-4 sm:p-6 flex flex-wrap items-end gap-3 border-b">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Student, receipt or invoice no."
            className={`${inputClass} pl-10 w-full`}
          />
        </div>
        <label className="text-xs text-slate-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} block mt-1`}
          />
        </label>
        <label className="text-xs text-slate-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className={`${inputClass} block mt-1`}
          />
        </label>
        <select
          value={method}
          onChange={(e) => {
            setMethod(e.target.value);
            setPage(1);
          }}
          className={inputClass}
        >
          <option value="">All methods</option>
          {Object.entries(methodLabel).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="ml-auto text-right">
          <p className="text-xs text-slate-500">Collected (this filter)</p>
          <p className="text-xl font-bold text-success">
            {fmt(data.collected, currency)}
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b">
              <th className="pl-6">Receipt</th>
              <th>Date</th>
              <th>Student</th>
              <th>Invoice</th>
              <th>Method</th>
              <th>Amount</th>
              <th>Received by</th>
              <th className="pr-6 text-right">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="8" className="py-10 text-center text-slate-400">
                  <Loader2 className="animate-spin inline mr-2" size={18} />
                  Loading...
                </td>
              </tr>
            )}
            {!loading &&
              data.rows.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b ${p.status === "voided" ? "text-slate-400" : ""}`}
                >
                  <td className="pl-6 font-medium">
                    {p.receipt_no}{" "}
                    {p.status === "voided" && (
                      <span className="text-xs text-danger">(void)</span>
                    )}
                  </td>
                  <td>{p.paid_date}</td>
                  <td>{p.full_name}</td>
                  <td>{p.invoice_no}</td>
                  <td>{methodLabel[p.method]}</td>
                  <td
                    className={
                      p.status === "voided" ? "line-through" : "font-medium"
                    }
                  >
                    {fmt(p.amount)}
                  </td>
                  <td className="text-sm">{p.received_by || "-"}</td>
                  <td className="pr-6 text-right">
                    <button
                      onClick={() => navigate(`/receipt/${p.id}`)}
                      className="p-2 rounded-lg hover:bg-slate-100 text-teal"
                      title="View receipt"
                    >
                      <Receipt size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            {!loading && data.rows.length === 0 && (
              <tr>
                <td colSpan="8" className="py-12 text-center text-slate-400">
                  No payments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 border-t text-sm text-slate-600">
        <span>
          {data.total} payment{data.total === 1 ? "" : "s"}
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
    </div>
  );
}
