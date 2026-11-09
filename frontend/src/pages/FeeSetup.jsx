import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import api from "../api";
import { useToast } from "../components/Feedback";
import { fmt } from "../utils/money";

const grades = Array.from({ length: 12 }, (_, i) => i + 1);

export default function FeeSetup() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = user.role === "admin";
  const toast = useToast();
  const [look, setLook] = useState(null);
  const [yearId, setYearId] = useState("");
  const [amounts, setAmounts] = useState({});
  const [typeName, setTypeName] = useState("");
  const [currency, setCurrency] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLookups = async () => {
    try {
      const r = await api.get("/fees/lookups");
      setLook(r.data);
      setYearId(String(r.data.year_id || ""));
      setCurrency(r.data.currency);
    } catch (err) {
      toast(err.response?.data?.error || "Could not load the page", "error");
    }
  };

  useEffect(() => {
    loadLookups();
  }, []);

  useEffect(() => {
    if (!yearId) return;
    api
      .get("/fees/structures", { params: { year_id: yearId } })
      .then((r) => {
        const map = {};
        r.data.forEach((x) => {
          map[`${x.grade_no}|${x.fee_type_id}`] = String(x.amount);
        });
        setAmounts(map);
      })
      .catch((err) =>
        toast(err.response?.data?.error || "Could not load fees", "error"),
      );
  }, [yearId]);

  const types = (look?.fee_types || []).filter((t) => t.active);
  const year = (look?.years || []).find((y) => String(y.id) === String(yearId));
  const closed = year?.status === "closed";

  const save = async () => {
    const rows = [];
    types.forEach((t) =>
      grades.forEach((g) => {
        const v = (amounts[`${g}|${t.id}`] ?? "").trim();
        rows.push({
          grade_no: g,
          fee_type_id: t.id,
          amount: v === "" ? null : v,
        });
      }),
    );
    setSaving(true);
    try {
      await api.put("/fees/structures", { year_id: yearId, rows });
      toast("Fees saved");
    } catch (err) {
      toast(err.response?.data?.error || "Could not save fees", "error");
    } finally {
      setSaving(false);
    }
  };

  const addType = async (e) => {
    e.preventDefault();
    try {
      await api.post("/fees/types", { name: typeName });
      setTypeName("");
      toast("Fee type added");
      loadLookups();
    } catch (err) {
      toast(err.response?.data?.error || "Could not add the fee type", "error");
    }
  };

  const toggleType = async (t) => {
    try {
      await api.put(`/fees/types/${t.id}`, { active: !t.active });
      loadLookups();
    } catch (err) {
      toast(err.response?.data?.error || "Could not update", "error");
    }
  };

  const saveCurrency = async () => {
    try {
      await api.put("/fees/currency", { currency });
      toast("Currency saved");
      loadLookups();
    } catch (err) {
      toast(
        err.response?.data?.error || "Could not save the currency",
        "error",
      );
    }
  };

  const rowTotal = (g) =>
    types.reduce((a, t) => a + (Number(amounts[`${g}|${t.id}`]) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          Academic year
          <select
            value={yearId}
            onChange={(e) => setYearId(e.target.value)}
            className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 bg-white"
          >
            {(look?.years || []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} ({y.status})
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={addType} className="flex gap-2">
          <input
            value={typeName}
            onChange={(e) => setTypeName(e.target.value)}
            placeholder="New fee type, e.g. Transport"
            className="border border-slate-300 rounded-lg px-3 py-2"
            required
          />
          <button
            type="submit"
            className="flex items-center gap-1 bg-navy hover:bg-navy-light text-white px-3 py-2 rounded-lg"
          >
            <Plus size={16} /> Add
          </button>
        </form>
        {isAdmin && (
          <div className="flex gap-2 items-end">
            <label className="text-sm">
              Currency
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="block mt-1 border border-slate-300 rounded-lg px-3 py-2 w-24"
              />
            </label>
            <button
              onClick={saveCurrency}
              className="border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-lg"
            >
              Save
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="px-6 py-4 border-b flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate-600">
            Amount per student, per grade ({look?.currency}). Leave a box empty
            for no fee.
          </p>
          <div className="flex flex-wrap gap-2">
            {(look?.fee_types || []).map((t) => (
              <button
                key={t.id}
                onClick={() => toggleType(t)}
                className={`text-xs px-2 py-1 rounded-full border ${t.active ? "bg-teal text-white border-teal" : "text-slate-400 border-slate-300 line-through"}`}
                title="Click to show or hide this fee"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="pl-6">Grade</th>
                {types.map((t) => (
                  <th key={t.id}>{t.name}</th>
                ))}
                <th className="pr-6">Total</th>
              </tr>
            </thead>
            <tbody>
              {grades.map((g) => (
                <tr key={g} className="border-b">
                  <td className="pl-6 font-medium">Grade {g}</td>
                  {types.map((t) => (
                    <td key={t.id} className="py-1">
                      <input
                        inputMode="decimal"
                        disabled={closed}
                        value={amounts[`${g}|${t.id}`] ?? ""}
                        onChange={(e) =>
                          setAmounts({
                            ...amounts,
                            [`${g}|${t.id}`]: e.target.value,
                          })
                        }
                        className="w-28 border border-slate-300 rounded-lg px-2 py-1 disabled:bg-slate-100"
                      />
                    </td>
                  ))}
                  <td className="pr-6 font-semibold">{fmt(rowTotal(g))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t flex items-center gap-4">
          <button
            onClick={save}
            disabled={saving || closed || !yearId}
            className="bg-teal text-white px-6 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save fees"}
          </button>
          {closed && (
            <p className="text-sm text-slate-500">
              This year is closed, so its fees are read-only.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
