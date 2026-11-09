import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Wallet, TrendingUp, AlertCircle, FileText } from "lucide-react";
import api from "../api";
import { useToast } from "../components/Feedback";
import { fmt, methodLabel } from "../utils/money";

function Stat({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex items-center gap-4">
      <div className="rounded-lg p-3 text-white" style={{ background: color }}>
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function FeeReports() {
  const toast = useToast();
  const [years, setYears] = useState([]);
  const [yearId, setYearId] = useState("");
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get("/fees/lookups")
      .then((r) => {
        setYears(r.data.years);
        setYearId(String(r.data.year_id || ""));
      })
      .catch((err) =>
        toast(err.response?.data?.error || "Could not load the page", "error"),
      );
  }, []);

  useEffect(() => {
    if (!yearId) return;
    setData(null);
    api
      .get("/fees/reports/summary", { params: { year_id: yearId } })
      .then((r) => setData(r.data))
      .catch((err) =>
        toast(
          err.response?.data?.error || "Could not load the report",
          "error",
        ),
      );
  }, [yearId]);

  const cur = data?.currency;
  const rate =
    data && data.invoiced > 0
      ? Math.round((data.collected / data.invoiced) * 100)
      : 0;
  const chart = (data?.per_grade || []).map((g) => ({
    grade: g.grade_no,
    Collected: g.collected,
    Outstanding: g.outstanding,
  }));

  return (
    <div className="space-y-6">
      <div className="print:hidden bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center gap-4">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 bg-white"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name} ({y.status})
            </option>
          ))}
        </select>
        {data && (
          <button
            onClick={() => window.print()}
            className="bg-navy hover:bg-navy-light text-white px-4 py-2 rounded-lg"
          >
            Print / Save as PDF
          </button>
        )}
      </div>

      {!data && <p className="text-slate-500">Loading...</p>}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              label="Invoiced"
              value={fmt(data.invoiced, cur)}
              icon={FileText}
              color="#142B4A"
            />
            <Stat
              label="Collected"
              value={fmt(data.collected, cur)}
              icon={Wallet}
              color="#16A34A"
            />
            <Stat
              label="Outstanding"
              value={fmt(data.outstanding, cur)}
              icon={AlertCircle}
              color="#DC2626"
            />
            <Stat
              label="Collection rate"
              value={`${rate}%`}
              icon={TrendingUp}
              color="#0D9488"
            />
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="font-semibold mb-4">
              Collected and outstanding by grade
            </h2>
            {chart.length === 0 ? (
              <p className="text-slate-400 text-sm">
                No invoices for this year yet.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="grade"
                      label={{
                        value: "Grade",
                        position: "insideBottom",
                        offset: -2,
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(v) => fmt(v, cur)}
                      labelFormatter={(l) => `Grade ${l}`}
                    />
                    <Legend />
                    <Bar dataKey="Collected" stackId="a" fill="#16A34A" />
                    <Bar dataKey="Outstanding" stackId="a" fill="#DC2626" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
              <h2 className="font-semibold mb-4">By grade</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th>Grade</th>
                    <th>Invoices</th>
                    <th>Invoiced</th>
                    <th>Collected</th>
                    <th>Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {data.per_grade.map((g) => (
                    <tr key={g.grade_no} className="border-b">
                      <td>Grade {g.grade_no}</td>
                      <td>{g.invoices}</td>
                      <td>{fmt(g.invoiced)}</td>
                      <td>{fmt(g.collected)}</td>
                      <td>{fmt(g.outstanding)}</td>
                    </tr>
                  ))}
                  {data.per_grade.length === 0 && (
                    <tr>
                      <td colSpan="5" className="py-4 text-slate-400">
                        No data.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="font-semibold mb-4">By payment method</h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b">
                    <th>Method</th>
                    <th>Payments</th>
                    <th>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.methods.map((m) => (
                    <tr key={m.method} className="border-b">
                      <td>{methodLabel[m.method]}</td>
                      <td>{m.payments}</td>
                      <td>{fmt(m.amount, cur)}</td>
                    </tr>
                  ))}
                  {data.methods.length === 0 && (
                    <tr>
                      <td colSpan="3" className="py-4 text-slate-400">
                        No payments yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 overflow-x-auto">
            <h2 className="font-semibold mb-4">
              Outstanding balances (largest 50)
            </h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th>Student</th>
                  <th>Class</th>
                  <th>Invoice</th>
                  <th>Due</th>
                  <th>Balance</th>
                  <th>Parents</th>
                </tr>
              </thead>
              <tbody>
                {data.debtors.map((d) => (
                  <tr key={d.invoice_no} className="border-b">
                    <td className="font-medium">{d.full_name}</td>
                    <td>
                      {d.class_name ? `${d.class_name} - ${d.section}` : "-"}
                    </td>
                    <td>{d.invoice_no}</td>
                    <td>{d.due_date || "-"}</td>
                    <td className="text-danger font-medium">
                      {fmt(d.balance, cur)}
                    </td>
                    <td className="text-slate-600">{d.parents || "-"}</td>
                  </tr>
                ))}
                {data.debtors.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-400">
                      No outstanding balances.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
