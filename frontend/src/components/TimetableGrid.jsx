export default function TimetableGrid({
  periods,
  days,
  entries,
  kind,
  onCell,
}) {
  const find = (day, periodId) =>
    entries.find((e) => e.day === day && e.period_id === periodId);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm min-w-[640px]">
        <thead>
          <tr>
            <th className="border bg-slate-50 p-2 text-left w-32">Period</th>
            {days.map((d) => (
              <th key={d.n} className="border bg-slate-50 p-2">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((p) => {
            const time = (
              <div className="text-xs text-slate-400">
                {p.start_time} - {p.end_time}
              </div>
            );
            if (p.is_break) {
              return (
                <tr key={p.id} className="bg-slate-100">
                  <td className="border p-2 text-slate-500">
                    {p.name}
                    {time}
                  </td>
                  <td
                    colSpan={days.length}
                    className="border p-2 text-center text-xs uppercase tracking-wide text-slate-400"
                  >
                    {p.name}
                  </td>
                </tr>
              );
            }
            return (
              <tr key={p.id}>
                <td className="border p-2 font-medium">
                  {p.name}
                  {time}
                </td>
                {days.map((d) => {
                  const e = find(d.n, p.id);
                  const body = e ? (
                    kind === "teacher" ? (
                      <>
                        <p className="font-medium">
                          {e.class_name} - {e.section}
                        </p>
                        <p className="text-xs text-slate-600">{e.subject}</p>
                      </>
                    ) : (
                      <>
                        <p className="font-medium">{e.subject}</p>
                        <p className="text-xs text-slate-600">
                          {e.teacher || "No teacher"}
                        </p>
                      </>
                    )
                  ) : (
                    <span className="text-slate-300">{onCell ? "+" : "-"}</span>
                  );
                  const room = e?.classroom ? (
                    <p className="text-xs text-teal">{e.classroom}</p>
                  ) : null;
                  return (
                    <td key={d.n} className="border p-0 align-top">
                      {onCell ? (
                        <button
                          type="button"
                          onClick={() => onCell(d.n, p, e)}
                          className="w-full h-full min-h-16 text-left p-2 hover:bg-teal/10"
                        >
                          {body}
                          {room}
                        </button>
                      ) : (
                        <div className="p-2 min-h-16">
                          {body}
                          {room}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
