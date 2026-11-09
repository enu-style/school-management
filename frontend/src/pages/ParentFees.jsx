import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import api from "../api";
import { fmt, methodLabel } from "../utils/money";

export default function ParentFees() {
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [id, setId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/parent/children")
      .then((r) => {
        setChildren(r.data);
        if (r.data.length === 1) setId(String(r.data[0].id));
      })
      .catch(() => setError("Could not load your children"));
  }, []);

  useEffect(() => {
    setData(null);
    setError("");
    if (!id) return;
    api
      .get(`/parent-fees/children/${id}/invoices`)
      .then((r) => setData(r.data))
      .catch((err) =>
        setError(err.response?.data?.error || "Could not load the fees"),
      );
  }, [id]);

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

      {!id && (
        <p className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          Select a child to see invoices and balances.
        </p>
      )}
      {data && data.invoices.length === 0 && (
        <p className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          No invoices yet.
        </p>
      )}

      {data &&
        data.invoices.map((inv) => (
          <div
            key={inv.id}
            className="bg-white rounded-xl shadow-sm border border-slate-200 p-5"
          >
            <div className="flex flex-wrap justify-between gap-3 mb-4">
              <div>
                <p className="font-semibold">{inv.invoice_no}</p>
                <p className="text-sm text-slate-500">
                  {inv.year}
                  {inv.due_date ? ` | Due ${inv.due_date}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Balance</p>
                <p
                  className={`text-xl font-bold ${inv.balance > 0 ? "text-danger" : "text-success"}`}
                >
                  {fmt(inv.balance, data.currency)}
                </p>
              </div>
            </div>

            <table className="w-full text-left text-sm mb-4">
              <tbody>
                {inv.items.map((i, n) => (
                  <tr key={n} className="border-b">
                    <td className="py-1">{i.description}</td>
                    <td className="text-right">{fmt(i.amount)}</td>
                  </tr>
                ))}
                {inv.discount > 0 && (
                  <tr className="border-b text-slate-600">
                    <td className="py-1">Discount</td>
                    <td className="text-right">- {fmt(inv.discount)}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="py-1">Total</td>
                  <td className="text-right">
                    {fmt(inv.total, data.currency)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1">Paid</td>
                  <td className="text-right text-success">
                    {fmt(inv.paid, data.currency)}
                  </td>
                </tr>
              </tbody>
            </table>

            {inv.payments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {inv.payments.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => navigate(`/receipt/${p.id}`)}
                    className="flex items-center gap-2 border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1 text-sm"
                  >
                    <Receipt size={14} /> {p.receipt_no} | {fmt(p.amount)} |{" "}
                    {p.paid_date} | {methodLabel[p.method]}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
