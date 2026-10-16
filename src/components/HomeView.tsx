import { useRef } from "react";
import type { Store } from "../App";
import type { OffType, Shift } from "../types";
import { addMonths, calendarGrid, isValidISODate, parseISODate, todayISO, WEEKDAYS } from "../lib/date";
import { formatHours, isFinished, shiftsInMonth, sortShifts, summarize, workMinutes } from "../lib/shift";
import { Icon } from "./Icon";
import type { YM } from "./MonthNav";

interface Props {
  store: Store;
  ym: YM;
  setYm: (ym: YM) => void;
  selected: string;
  onSelect: (iso: string) => void;
  onEdit: (s: Shift) => void;
  onAdd: (date: string) => void;
  onDelete: (s: Shift) => void;
  onClearOff: (date: string, type: OffType) => void;
  goList: () => void;
}

export function HomeView({ store, ym, setYm, selected, onSelect, onEdit, onAdd, onDelete, onClearOff, goList }: Props) {
  const { data } = store;
  const rules = data.settings.breakRules;
  const today = todayISO();
  const now = new Date();

  const byDate = new Map<string, Shift[]>();
  for (const s of sortShifts(data.shifts)) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const offByDate = new Map(data.daysOff.map((d) => [d.date, d.type]));
  const colorOf = (s: Shift) => data.workplaces.find((w) => w.id === s.workplaceId)?.color ?? "var(--accent)";

  // 6 週目が丸ごと翌月なら表示しない
  let cells = calendarGrid(ym.year, ym.month);
  if (!cells.slice(35).some((c) => c.inMonth)) cells = cells.slice(0, 35);

  // 今月のバイト
  const monthShifts = shiftsInMonth(data.shifts, ym.year, ym.month);
  const total = summarize(monthShifts, data.workplaces, rules);
  const doneShifts = monthShifts.filter((s) => isFinished(s, now));
  const done = summarize(doneShifts, data.workplaces, rules);
  const priced = total.pay > 0;
  const progress = total.minutes > 0 ? done.minutes / total.minutes : 0;
  const R = 26;
  const C = 2 * Math.PI * R;

  // 選んだ日
  const sel = parseISODate(selected);
  const dayShifts = byDate.get(selected) ?? [];
  const dayOff = offByDate.get(selected) ?? null;

  // 左右スワイプで月を切り替える
  const touchX = useRef<number | null>(null);
  const move = (delta: number) => setYm(addMonths(ym.year, ym.month, delta));
  /** その日を選んで、その月を表示する */
  const jump = (iso: string) => {
    const d = parseISODate(iso);
    onSelect(iso);
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  return (
    <div className="home">
      <header className="home-head">
        <button className="big-month" aria-label="今日に戻る" onClick={() => jump(today)}>
          <span className="big-num">{ym.month}</span>
          <span className="big-year">{ym.year}年</span>
        </button>
        <div className="head-actions">
          <button className="round-btn" aria-label="前の月" onClick={() => move(-1)}>
            <Icon name="left" />
          </button>
          <button className="round-btn" aria-label="次の月" onClick={() => move(1)}>
            <Icon name="right" />
          </button>
          {/* 透明な日付入力を重ねて、タップで端末の日付ピッカーを開く */}
          <label className="round-btn picker-btn" aria-label="日付を選んで移動">
            <Icon name="calgrid" size={26} />
            <input
              type="date"
              value={selected}
              onClick={(e) => {
                try {
                  e.currentTarget.showPicker();
                } catch {
                  // showPicker が使えない端末では、入力欄そのもののタップでピッカーが開く
                }
              }}
              onChange={(e) => isValidISODate(e.target.value) && jump(e.target.value)}
            />
          </label>
        </div>
      </header>

      <div
        className="cal"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 60) move(dx < 0 ? 1 : -1);
        }}
      >
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-wd wd-${i}`}>
            {w}
          </div>
        ))}
        {cells.map((c) => {
          const list = byDate.get(c.iso) ?? [];
          const off = offByDate.get(c.iso);
          return (
            <button
              key={c.iso}
              className={`cal-day${c.inMonth ? "" : " out"}${c.iso === selected ? " sel" : ""}${c.iso === today ? " today" : ""}`}
              onClick={() => onSelect(c.iso)}
              aria-label={`${c.iso}${list.length ? ` シフト${list.length}件` : ""}${off ? ` ${off}` : ""}`}
            >
              <span className={`num wd-${c.weekday}`}>{c.day}</span>
              {list.length > 0 && (
                <span className="cal-shift" style={{ color: colorOf(list[0]) }}>
                  {list[0].start.replace(/^0/, "")}
                  {list.length > 1 && <small>+{list.length - 1}</small>}
                </span>
              )}
              {list.length === 0 && off && <span className={`cal-off off-${off}`}>{off}</span>}
            </button>
          );
        })}
      </div>

      <button className="board" onClick={goList}>
        <svg className="ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r={R} className="ring-bg" />
          <circle
            cx="32"
            cy="32"
            r={R}
            className="ring-fg"
            strokeDasharray={`${C * progress} ${C}`}
            transform="rotate(-90 32 32)"
          />
        </svg>
        <span className="board-main">
          <small>{ym.month}月のバイト（見込み）</small>
          <strong>{priced ? `¥${total.pay.toLocaleString()}` : formatHours(total.minutes)}</strong>
          <span className="board-sub">
            <b>{priced ? `¥${done.pay.toLocaleString()}` : formatHours(done.minutes)}</b> 働いた分
          </span>
          <span className="board-sub">
            {formatHours(total.minutes)}・{monthShifts.length}回
          </span>
        </span>
        <span className="board-go">
          <Icon name="chevron" size={20} />
        </span>
      </button>
      {!priced && monthShifts.length > 0 && <p className="hint">設定 → 勤務先 で時給を入れると、見込み給料が出ます。</p>}

      <section className="day">
        <h2 className="day-title">
          {sel.getFullYear()}年{sel.getMonth() + 1}月{sel.getDate()}日({WEEKDAYS[sel.getDay()]})
        </h2>

        {dayOff && (
          <div className={`item off-item off-${dayOff}`}>
            <span className="item-main">
              <span className="item-time">休み</span>
              <span className="item-bar" />
              <span className="item-body">
                <strong>{dayOff}</strong>
              </span>
            </span>
            <button className="item-del" aria-label={`${dayOff}を取り消す`} onClick={() => onClearOff(selected, dayOff)}>
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        {dayShifts.map((s) => {
          const wp = data.workplaces.find((w) => w.id === s.workplaceId);
          return (
            <div key={s.id} className="item">
              <button className="item-main" onClick={() => onEdit(s)}>
                <span className="item-time">{s.start}</span>
                <span className="item-bar" style={{ background: colorOf(s) }} />
                <span className="item-body">
                  <strong>{wp?.name ?? "シフト"}</strong>
                  <small>
                    {s.start}〜{s.end}・実働 {formatHours(workMinutes(s, rules))}
                    {s.note && `・${s.note}`}
                  </small>
                </span>
              </button>
              <button className="item-del" aria-label={`${s.start}〜${s.end} のシフトを削除`} onClick={() => onDelete(s)}>
                <Icon name="close" size={18} />
              </button>
            </div>
          );
        })}

        {dayShifts.length === 0 && !dayOff && <p className="empty">予定はありません</p>}
        <button className="add-line" onClick={() => onAdd(selected)}>
          <Icon name="plus" size={18} /> この日にシフトを追加
        </button>
      </section>
    </div>
  );
}
