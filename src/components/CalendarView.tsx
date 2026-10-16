import { useState } from "react";
import type { Store } from "../App";
import type { Shift } from "../types";
import { calendarGrid, formatDateJa, todayISO, WEEKDAYS } from "../lib/date";
import { formatHours, shiftsInMonth, sortShifts, summarize, workMinutes } from "../lib/shift";
import { MonthNav, type YM } from "./MonthNav";
import { ShiftEditor } from "./ShiftEditor";

export function CalendarView({ store, ym, setYm }: { store: Store; ym: YM; setYm: (ym: YM) => void }) {
  const { data } = store;
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Shift | "new" | null>(null);

  const byDate = new Map<string, Shift[]>();
  for (const s of data.shifts) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  const color = (s: Shift) => data.workplaces.find((w) => w.id === s.workplaceId)?.color ?? "var(--accent)";
  const rules = data.settings.breakRules;
  const summary = summarize(shiftsInMonth(data.shifts, ym.year, ym.month), data.workplaces, rules);
  const today = todayISO();
  const dayShifts = selected ? sortShifts(byDate.get(selected) ?? []) : [];

  return (
    <div>
      <MonthNav ym={ym} setYm={setYm} />
      <div className="calendar">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-head wd-${i}`}>
            {w}
          </div>
        ))}
        {calendarGrid(ym.year, ym.month).map((c) => {
          const list = sortShifts(byDate.get(c.iso) ?? []);
          return (
            <button
              key={c.iso}
              className={`cal-cell${c.inMonth ? "" : " out"}${c.iso === today ? " today" : ""}${c.iso === selected ? " selected" : ""}`}
              onClick={() => setSelected(c.iso)}
            >
              <span className={`cal-day wd-${c.weekday}`}>{c.day}</span>
              {list.slice(0, 2).map((s) => (
                <span key={s.id} className="chip" style={{ background: color(s) }}>
                  {s.start.replace(/^0/, "")}
                </span>
              ))}
              {list.length > 2 && <span className="more">+{list.length - 2}</span>}
            </button>
          );
        })}
      </div>

      <div className="summary">
        <div>
          <small>出勤</small>
          <strong>{summary.days}日</strong>
        </div>
        <div>
          <small>勤務時間</small>
          <strong>{formatHours(summary.minutes)}</strong>
        </div>
        <div>
          <small>見込み給料</small>
          <strong>¥{summary.pay.toLocaleString()}</strong>
        </div>
      </div>
      {summary.hasUnpriced && <p className="hint">※ 時給が未設定の勤務先のシフトは給料に含まれていません (設定 → 勤務先)。</p>}

      {selected && (
        <section className="day-panel">
          <div className="day-panel-head">
            <h3>{formatDateJa(selected)}</h3>
            <button className="primary small" onClick={() => setEditing("new")}>
              ＋ 追加
            </button>
          </div>
          {dayShifts.length === 0 && <p className="muted">シフトはありません</p>}
          {dayShifts.map((s) => {
            const wp = data.workplaces.find((w) => w.id === s.workplaceId);
            return (
              <button key={s.id} className="shift-row" onClick={() => setEditing(s)}>
                <span className="bar" style={{ background: color(s) }} />
                <span className="time">
                  {s.start}〜{s.end}
                </span>
                <span className="meta">
                  {wp?.name ?? "勤務先未設定"} ・ {formatHours(workMinutes(s, rules))}
                  {s.note && <em> ・ {s.note}</em>}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {editing && (
        <ShiftEditor
          store={store}
          shift={editing === "new" ? null : editing}
          date={selected ?? today}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
