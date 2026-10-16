import { useState } from "react";
import type { Store } from "../App";
import type { Shift } from "../types";
import { OFF_TYPES } from "../types";
import { monthKey, parseISODate, WEEKDAYS } from "../lib/date";
import { buildICS } from "../lib/ics";
import { formatHours, isFinished, nightMinutes, shiftPay, shiftsInMonth, summarize, workMinutes } from "../lib/shift";
import { downloadFile } from "../lib/storage";
import { MonthNav, type YM } from "./MonthNav";
import { Icon } from "./Icon";

const yen = (n: number) => `¥${n.toLocaleString()}`;

/** 「22:00–翌1:00」のように日付をまたぐ終了時刻を表す */
function timeRange(s: Shift): string {
  const overnight = s.end <= s.start;
  return `${s.start}–${overnight ? "翌" : ""}${overnight ? s.end.replace(/^0/, "") : s.end}`;
}

/** 進み具合の円グラフ: 明るい緑 = 働いた分、暗い緑 = 残りの見込み */
function Donut({ done, expected, full, label }: { done: number; expected: number; full: number; label: string }) {
  const size = 240;
  const stroke = 30;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = (v: number) => (full > 0 ? Math.min(1, v / full) : 0);
  // 2 つの弧の間にすき間を空ける (丸い端の分も含めて)
  const gap = expected > done && done > 0 ? stroke / c + 0.012 : 0;
  const doneLen = Math.max(0, frac(done) * c);
  const restStart = frac(done) + gap;
  const restLen = Math.max(0, (frac(expected) - restStart) * c);
  return (
    <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} className="donut-track" strokeWidth={stroke} />
      {restLen > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="donut-rest"
          strokeWidth={stroke}
          strokeDasharray={`${restLen} ${c}`}
          strokeDashoffset={-restStart * c}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      {doneLen > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="donut-done"
          strokeWidth={stroke}
          strokeDasharray={`${doneLen} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

export function ListView({ store, ym, setYm, onEdit }: { store: Store; ym: YM; setYm: (ym: YM) => void; onEdit: (s: Shift) => void }) {
  const { data, setData } = store;
  const rules = data.settings.breakRules;
  const goal = data.settings.monthlyGoal;
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalText, setGoalText] = useState(goal ? String(goal) : "");

  const now = new Date();
  const shifts = shiftsInMonth(data.shifts, ym.year, ym.month);
  const done = shifts.filter((s) => isFinished(s, now));
  const total = summarize(shifts, data.workplaces, rules);
  const worked = summarize(done, data.workplaces, rules);
  const priced = total.pay > 0;
  const night = shifts.reduce((n, s) => n + nightMinutes(s), 0);

  // 円グラフは金額 (時給が未設定なら時間) で描く。目標が見込みより大きければ目標を一周にする
  const doneVal = priced ? worked.pay : worked.minutes;
  const expVal = priced ? total.pay : total.minutes;
  const full = priced && goal && goal > expVal ? goal : expVal;

  const prefix = `${ym.year}-${String(ym.month).padStart(2, "0")}-`;
  const offCounts = OFF_TYPES.map((t) => [t, data.daysOff.filter((d) => d.type === t && d.date.startsWith(prefix)).length] as const).filter(
    ([, n]) => n > 0,
  );
  const lastDay = new Date(ym.year, ym.month, 0).getDate();
  const perWorkplace = [...data.workplaces, null]
    .map((wp) => {
      const list = shifts.filter((s) => (wp ? s.workplaceId === wp.id : !data.workplaces.some((w) => w.id === s.workplaceId)));
      return {
        wp,
        list,
        sum: summarize(list, data.workplaces, rules),
        done: summarize(
          list.filter((s) => isFinished(s, now)),
          data.workplaces,
          rules,
        ),
      };
    })
    .filter((p) => p.list.length > 0);

  let status = "この月のシフトはまだありません";
  if (shifts.length > 0) {
    status =
      done.length === shifts.length
        ? "この月のシフトはすべて終わりました"
        : `あと ${shifts.length - done.length} 回・${formatHours(total.minutes - worked.minutes)} のシフトがあります`;
  }

  const saveGoal = () => {
    const n = Number(goalText.replace(/[^\d]/g, ""));
    setData((d) => ({ ...d, settings: { ...d.settings, monthlyGoal: n > 0 ? n : null } }));
    setEditingGoal(false);
  };

  return (
    <div className="salary">
      <MonthNav ym={ym} setYm={setYm} caption="SALARY" />

      <section className="card salary-card">
        {editingGoal ? (
          <div className="goal-edit">
            <input
              inputMode="numeric"
              autoFocus
              placeholder="例: 80000"
              aria-label="月間目標 (円)"
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveGoal()}
            />
            <button className="primary small" onClick={saveGoal}>
              決定
            </button>
          </div>
        ) : (
          <button className="goal-pill" onClick={() => setEditingGoal(true)}>
            月間目標 <b>{goal ? yen(goal) : "を決める"}</b>
            <Icon name="pencil" size={16} />
          </button>
        )}

        <div className="donut-wrap">
          <Donut
            done={doneVal}
            expected={expVal}
            full={full}
            label={
              priced
                ? `給料見込 ${yen(total.pay)}、働いた分 ${yen(worked.pay)}`
                : `勤務時間 見込み ${formatHours(total.minutes)}、働いた分 ${formatHours(worked.minutes)}`
            }
          />
          <div className="donut-center">
            <span className="legend">
              <i className="dot-rest" />
              {priced ? "給料見込" : "勤務見込"}
            </span>
            <strong>{priced ? yen(total.pay) : formatHours(total.minutes)}</strong>
            <span className="legend">
              <i className="dot-done" />
              働いた分
            </span>
            <b className="done-val">{priced ? yen(worked.pay) : formatHours(worked.minutes)}</b>
          </div>
        </div>

        <p className="salary-status">{status}</p>
        {priced && goal ? (
          <p className="salary-status">{total.pay >= goal ? "🎉 見込みで目標達成！" : `目標まであと ${yen(goal - total.pay)}`}</p>
        ) : null}
        {!priced && shifts.length > 0 && <p className="hint center">設定 → 勤務先 で時給を入れると金額で表示されます</p>}

        <div className="salary-stats">
          <span>
            勤務時間 <b>{formatHours(total.minutes)}</b>
          </span>
          <span>
            シフト <b>
              {done.length}/{shifts.length}回
            </b>
          </span>
        </div>

        {perWorkplace.length > 0 && (
          <table className="wp-table">
            <thead>
              <tr>
                <th />
                <th>勤務時間</th>
                <th>給料見込</th>
                <th>働いた分</th>
              </tr>
            </thead>
            <tbody>
              {perWorkplace.map((p) => (
                <tr key={p.wp?.id ?? "none"}>
                  <td>
                    <span className="wp-name">
                      <i style={{ background: p.wp?.color ?? "var(--muted)" }} />
                      {p.wp?.name ?? "勤務先未設定"}
                    </span>
                    <small>
                      {ym.month}/1〜{ym.month}/{lastDay}
                    </small>
                  </td>
                  <td>{formatHours(p.sum.minutes)}</td>
                  <td>{p.wp?.hourlyWage != null ? yen(p.sum.pay) : "—"}</td>
                  <td className="green">{p.wp?.hourlyWage != null ? yen(p.done.pay) : formatHours(p.done.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {night > 0 && (
          <div className="salary-line">
            <span className="muted">うち深夜（22時〜5時）</span>
            <span>{formatHours(night)}</span>
          </div>
        )}
        {offCounts.length > 0 && (
          <div className="salary-line">
            <span className="muted">休み</span>
            <span className="off-counts">
              {offCounts.map(([t, n]) => (
                <span key={t} className={`off-tag off-${t}`}>
                  {t} {n}日
                </span>
              ))}
            </span>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h3>シフト</h3>
          <span className="muted">{shifts.length}回</span>
        </div>
        {shifts.length === 0 && <p className="muted">この月のシフトはありません</p>}
        {shifts.map((s) => {
          const d = parseISODate(s.date);
          const pay = shiftPay(s, data.workplaces, rules);
          const fin = isFinished(s, now);
          const nm = nightMinutes(s);
          return (
            <button key={s.id} className="salary-row" onClick={() => onEdit(s)}>
              <span className="sr-date">
                {d.getMonth() + 1}/{d.getDate()}({WEEKDAYS[d.getDay()]})
              </span>
              <span className="sr-time">
                <span>{timeRange(s)}</span>
                <small>
                  {formatHours(workMinutes(s, rules))}
                  {nm > 0 && `・深夜${formatHours(nm)}`}
                </small>
              </span>
              <span className={`sr-pay${fin ? " fin" : ""}`}>
                <b>{pay != null ? yen(pay) : formatHours(workMinutes(s, rules))}</b>
                <small>{fin ? "済み" : "予定"}</small>
              </span>
            </button>
          );
        })}
      </section>

      <button
        className="wide"
        disabled={shifts.length === 0}
        onClick={() => downloadFile(`shift-${monthKey(ym.year, ym.month)}.ics`, buildICS(shifts, data.workplaces), "text/calendar")}
      >
        カレンダーアプリに書き出す (.ics)
      </button>
      <p className="hint center">Google カレンダーや iPhone のカレンダーに読み込めます。</p>
    </div>
  );
}
