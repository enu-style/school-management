import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import { fmt, methodLabel } from "../utils/money";

export default function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const role = JSON.parse(localStorage.getItem("user") || "{}").role;
  const base = role === "parent" ? "/parent-fees/receipts" : "/fees/receipts";
  const [r, setR] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get(`${base}/${id}`)
      .then((res) => setR(res.data))
      .catch((err) =>
        setError(err.response?.data?.error || "Could not load the receipt"),
      );
  }, [id]);

  if (error)
    return <p className="bg-red-100 text-red-700 p-4 rounded-lg">{error}</p>;
  if (!r) return <p className="text-slate-500">Loading...</p>;

  return (
    <div>
      <div className="print:hidden flex gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={() => window.print()}
          className="bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
        >
          Print / Save as PDF
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-xl mx-auto relative">
        {r.status === "voided" && (
          <p className="absolute top-6 right-6 border-2 border-danger text-danger font-bold px-3 py-1 rounded rotate-6">
            VOID
          </p>
        )}
        <div className="text-center border-b pb-4 mb-4">
          <h1 className="text-2xl font-bold">School Management</h1>
          <p className="text-slate-600">Payment Receipt</p>
        </div>

        <dl className="grid grid-cols-2 gap-y-2 text-sm mb-6">
          <dt className="text-slate-500">Receipt no.</dt>
          <dd className="font-medium">{r.receipt_no}</dd>
          <dt className="text-slate-500">Date</dt>
          <dd>{r.paid_date}</dd>
          <dt className="text-slate-500">Student</dt>
          <dd>{r.full_name}</dd>
          <dt className="text-slate-500">Class</dt>
          <dd>{r.class_name ? `${r.class_name} - ${r.section}` : "-"}</dd>
          <dt className="text-slate-500">Academic year</dt>
          <dd>{r.year}</dd>
          <dt className="text-slate-500">Invoice</dt>
          <dd>{r.invoice_no}</dd>
          <dt className="text-slate-500">Method</dt>
          <dd>{methodLabel[r.method]}</dd>
          {r.reference && (
            <>
              <dt className="text-slate-500">Reference</dt>
              <dd>{r.reference}</dd>
            </>
          )}
          {r.received_by && (
            <>
              <dt className="text-slate-500">Received by</dt>
              <dd>{r.received_by}</dd>
            </>
          )}
        </dl>

        <div className="border rounded-lg p-4 text-center mb-6">
          <p className="text-xs text-slate-500">Amount paid</p>
          <p className="text-3xl font-bold">{fmt(r.amount, r.currency)}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center text-sm mb-6">
          <div>
            <p className="text-xs text-slate-500">Invoice total</p>
            <p className="font-medium">{fmt(r.invoice_total)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Paid so far</p>
            <p className="font-medium">{fmt(r.invoice_paid)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Balance</p>
            <p className="font-medium">{fmt(r.invoice_balance)}</p>
          </div>
        </div>

        {r.status === "voided" && (
          <p className="text-sm text-danger mb-4">
            This payment was voided: {r.void_reason}
          </p>
        )}

        <div className="grid grid-cols-2 gap-8 text-center text-sm text-slate-600 mt-10">
          <div className="border-t pt-2">Cashier</div>
          <div className="border-t pt-2">Parent / Guardian</div>
        </div>
      </div>
    </div>
  );
}
