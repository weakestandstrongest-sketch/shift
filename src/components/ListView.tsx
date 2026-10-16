import { useState } from "react";
import type { Store } from "../App";
import type { Shift } from "../types";
import { formatDateJa, monthKey } from "../lib/date";
import { buildICS } from "../lib/ics";
import { formatHours, shiftPay, shiftsInMonth, summarize, workMinutes } from "../lib/shift";
import { downloadFile } from "../lib/storage";
import { MonthNav, type YM } from "./MonthNav";
import { ShiftEditor } from "./ShiftEditor";

export function ListView({ store, ym, setYm }: { store: Store; ym: YM; setYm: (ym: YM) => void }) {
  const { data } = store;
  const [editing, setEditing] = useState<Shift | null>(null);
  const shifts = shiftsInMonth(data.shifts, ym.year, ym.month);
  const total = summarize(shifts, data.workplaces);

  const perWorkplace = [...data.workplaces, null].map((wp) => {
    const list = shifts.filter((s) => (wp ? s.workplaceId === wp.id : !data.workplaces.some((w) => w.id === s.workplaceId)));
    return { wp, list, sum: summarize(list, data.workplaces) };
  });

  return (
    <div>
      <MonthNav ym={ym} setYm={setYm} />

      <div className="card">
        <h3>見込み給料</h3>
        <p className="big">¥{total.pay.toLocaleString()}</p>
        <p className="muted">
          出勤 {total.days}日 ・ {formatHours(total.minutes)}
        </p>
        {perWorkplace
          .filter((p) => p.list.length > 0)
          .map((p) => (
            <div key={p.wp?.id ?? "none"} className="wp-line">
              <span className="dot" style={{ background: p.wp?.color ?? "var(--muted)" }} />
              <span>{p.wp?.name ?? "勤務先未設定"}</span>
              <span className="spacer" />
              <span>
                {formatHours(p.sum.minutes)} ・ {p.wp?.hourlyWage != null ? `¥${p.sum.pay.toLocaleString()}` : "時給未設定"}
              </span>
            </div>
          ))}
      </div>

      {shifts.length === 0 ? (
        <p className="muted center">この月のシフトはありません</p>
      ) : (
        <div className="card list">
          {shifts.map((s) => {
            const wp = data.workplaces.find((w) => w.id === s.workplaceId);
            const pay = shiftPay(s, data.workplaces);
            return (
              <button key={s.id} className="shift-row" onClick={() => setEditing(s)}>
                <span className="bar" style={{ background: wp?.color ?? "var(--accent)" }} />
                <span className="date">{formatDateJa(s.date)}</span>
                <span className="time">
                  {s.start}〜{s.end}
                </span>
                <span className="meta">
                  {formatHours(workMinutes(s))}
                  {pay != null && ` ・ ¥${pay.toLocaleString()}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        className="wide"
        disabled={shifts.length === 0}
        onClick={() => downloadFile(`shift-${monthKey(ym.year, ym.month)}.ics`, buildICS(shifts, data.workplaces), "text/calendar")}
      >
        📤 この月をカレンダーアプリに書き出す (.ics)
      </button>
      <p className="hint">Google カレンダーや iPhone のカレンダーに読み込めます。</p>

      {editing && <ShiftEditor store={store} shift={editing} date={editing.date} onClose={() => setEditing(null)} />}
    </div>
  );
}
