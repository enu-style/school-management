export const fmt = (n, cur = "") =>
  `${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? " " + cur : ""}`;

export const methodLabel = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
  cheque: "Cheque",
};

export const statusBadge = {
  paid: "bg-green-100 text-success",
  partial: "bg-amber-100 text-amber-700",
  unpaid: "bg-slate-100 text-slate-600",
  overdue: "bg-red-100 text-danger",
  cancelled: "bg-slate-200 text-slate-500",
};
