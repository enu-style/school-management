import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt } from "lucide-react";
import api from "../api";
import Modal from "./Modal";
import { useToast, useConfirm } from "./Feedback";
import { fmt, methodLabel, statusBadge } from "../utils/money";

const today = () => new Date().toLocaleDateString("en-CA");

export default function InvoiceDetail({
  id,
  currency,
  isAdmin,
  onClose,
  onChanged,
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [inv, setInv] = useState(null);
  const [pay, setPay] = useState({
    amount: "",
    method: "cash",
    reference: "",
    paid_date: today(),
  });
  const [discount, setDiscount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/fees/invoices/${id}`);
      setInv(r.data);
      setPay((p) => ({
        ...p,
        amount: r.data.balance > 0 ? String(r.data.balance) : "",
      }));
      setDiscount(r.data.discount ? String(r.data.discount) : "");
    } catch (err) {
      toast(err.response?.data?.error || "Could not load the invoice", "error");
      onClose();
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      toast(okMessage);
      await load();
      onChanged();
    } catch (err) {
      toast(err.response?.data?.error || "Something went wrong", "error");
    } finally {
      setBusy(false);
    }
  };

  const submitPay = (e) => {
    e.preventDefault();
    run(
      () => api.post(`/fees/invoices/${id}/payments`, pay),
      "Payment recorded",
    );
  };

  const applyDiscount = () => {
    if (!reason.trim()) return toast("Write a reason first", "error");
    run(
      () =>
        api.put(`/fees/invoices/${id}/discount`, {
          discount: discount || "0",
          reason,
        }),
      "Discount saved",
    );
  };

  const cancelInvoice = async () => {
    if (!reason.trim()) return toast("Write a reason first", "error");
    const ok = await confirm({
      title: "Cancel invoice?",
      message: `${inv.invoice_no} will be cancelled. It stays in the records and cannot be restored.`,
      confirmText: "Cancel invoice",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/fees/invoices/${id}/cancel`, { reason });
      toast("Invoice cancelled");
      onChanged();
      onClose();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not cancel the invoice",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const voidPayment = async (p) => {
    if (!reason.trim())
      return toast("Write a reason first (below, in Admin actions)", "error");
    const ok = await confirm({
      title: "Void payment?",
      message: `Receipt ${p.receipt_no} (${fmt(p.amount, currency)}) will be voided. It stays in the records.`,
      confirmText: "Void",
    });
    if (!ok) return;
    run(
      () => api.post(`/fees/payments/${p.id}/void`, { reason }),
      "Payment voided",
    );
  };

  const inputClass =
    "w-full border border-slate-300 rounded-lg px-3 py-2 bg-white";

  if (!inv)
    return (
      <Modal title="Invoice" onClose={onClose}>
        <p className="text-slate-400">Loading...</p>
      </Modal>
    );

  const active = inv.status === "active";
  const label = !active
    ? "cancelled"
    : inv.balance <= 0
      ? "paid"
      : inv.paid > 0
        ? "partial"
        : "unpaid";

  return (
    <Modal title={`Invoice ${inv.invoice_no}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="font-semibold text-lg">{inv.full_name}</p>
          <p className="text-sm text-slate-500">
            {inv.class_name ? `${inv.class_name} - ${inv.section}` : "No class"}{" "}
            | {inv.year}
            {inv.due_date ? ` | Due ${inv.due_date}` : ""}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm capitalize ${statusBadge[label]}`}
        >
          {label}
        </span>
      </div>

      {!active && (
        <p className="bg-slate-100 rounded-lg p-3 text-sm mb-4">
          Cancelled: {inv.cancel_reason}
        </p>
      )}

      <table className="w-full text-left mb-4">
        <thead>
          <tr className="border-b">
            <th>Item</th>
            <th className="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((i) => (
            <tr key={i.id} className="border-b">
              <td>{i.description}</td>
              <td className="text-right">{fmt(i.amount)}</td>
            </tr>
          ))}
          {inv.discount > 0 && (
            <tr className="border-b text-slate-600">
              <td>Discount ({inv.discount_reason})</td>
              <td className="text-right">- {fmt(inv.discount)}</td>
            </tr>
          )}
          <tr className="font-semibold">
            <td>Total</td>
            <td className="text-right">{fmt(inv.total, currency)}</td>
          </tr>
          <tr>
            <td>Paid</td>
            <td className="text-right text-success">
              {fmt(inv.paid, currency)}
            </td>
          </tr>
          <tr className="font-semibold">
            <td>Balance</td>
            <td className="text-right text-danger">
              {fmt(inv.balance, currency)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="text-xs uppercase tracking-wide text-slate-400 mb-2">
        Payments
      </p>
      <div className="overflow-x-auto border rounded-lg mb-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="pl-3">Receipt</th>
              <th>Date</th>
              <th>Method</th>
              <th>Amount</th>
              <th className="pr-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {inv.payments.map((p) => (
              <tr
                key={p.id}
                className={`border-b last:border-0 ${p.status === "voided" ? "text-slate-400 line-through" : ""}`}
              >
                <td className="pl-3">{p.receipt_no}</td>
                <td>{p.paid_date}</td>
                <td>{methodLabel[p.method]}</td>
                <td>{fmt(p.amount)}</td>
                <td className="pr-3">
                  <div className="flex justify-end gap-2 no-underline">
                    <button
                      onClick={() => navigate(`/receipt/${p.id}`)}
                      className="p-1 text-teal hover:bg-slate-100 rounded"
                      title="Receipt"
                    >
                      <Receipt size={16} />
                    </button>
                    {isAdmin && p.status === "valid" && (
                      <button
                        onClick={() => voidPayment(p)}
                        className="text-xs text-danger hover:underline"
                      >
                        Void
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {inv.payments.length === 0 && (
              <tr>
                <td colSpan="5" className="py-4 text-center text-slate-400">
                  No payments yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {active && inv.balance > 0 && (
        <form
          onSubmit={submitPay}
          className="grid sm:grid-cols-2 gap-3 p-4 border rounded-lg bg-slate-50 mb-6"
        >
          <p className="sm:col-span-2 font-medium">Record a payment</p>
          <input
            className={inputClass}
            placeholder="Amount"
            value={pay.amount}
            onChange={(e) => setPay({ ...pay, amount: e.target.value })}
            required
          />
          <select
            className={inputClass}
            value={pay.method}
            onChange={(e) => setPay({ ...pay, method: e.target.value })}
          >
            {Object.entries(methodLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            className={inputClass}
            placeholder="Reference (bank slip, transaction no.)"
            value={pay.reference}
            onChange={(e) => setPay({ ...pay, reference: e.target.value })}
          />
          <input
            type="date"
            max={today()}
            className={inputClass}
            value={pay.paid_date}
            onChange={(e) => setPay({ ...pay, paid_date: e.target.value })}
          />
          <button
            type="submit"
            disabled={busy}
            className="sm:col-span-2 bg-teal text-white py-2 rounded-lg hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving..." : "Record payment"}
          </button>
        </form>
      )}

      {isAdmin && active && (
        <div className="p-4 border rounded-lg space-y-3">
          <p className="font-medium">Admin actions</p>
          <input
            className={inputClass}
            placeholder="Reason (needed for a discount, a cancellation, or a void)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex flex-wrap gap-3">
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 w-40"
              placeholder="Discount amount"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
            <button
              onClick={applyDiscount}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              Save discount
            </button>
            <button
              onClick={cancelInvoice}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-red-300 text-danger hover:bg-red-50 disabled:opacity-60"
            >
              Cancel invoice
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
