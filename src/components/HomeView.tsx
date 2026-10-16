import { useState } from "react";
import type { Store } from "../App";
import type { CalEvent, OffType, Shift } from "../types";
import { addDays, addMonths, calendarGrid, isValidISODate, parseISODate, todayISO, WEEKDAYS } from "../lib/date";
import { formatHours, isFinished, shiftsInMonth, sortShifts, summarize, workMinutes } from "../lib/shift";
import { Icon } from "./Icon";
import { MonthGrid } from "./MonthGrid";
import { expandEvents, repeatLabel } from "../lib/repeat";
import type { YM } from "./MonthNav";

interface Props {
  store: Store;
  ym: YM;
  setYm: (ym: YM) => void;
  selected: string;
  onSelect: (iso: string) => void;
  onEdit: (s: Shift) => void;
  onEditEvent: (e: CalEvent) => void;
  onAdd: (date: string) => void;
  onDeleteEvent: (e: CalEvent) => void;
  onDelete: (s: Shift) => void;
  onClearOff: (date: string, type: OffType) => void;
  goList: () => void;
}

/** 終日の予定を先に、そのあと開始時刻の順 */
const eventOrder = (a: CalEvent, b: CalEvent) => (a.start ?? "").localeCompare(b.start ?? "");

export function HomeView({ store, ym, setYm, selected, onSelect, onEdit, onEditEvent, onAdd, onDelete, onDeleteEvent, onClearOff, goList }: Props) {
  const { data } = store;
  const rules = data.settings.breakRules;
  const today = todayISO();
  const now = new Date();

  const byDate = new Map<string, Shift[]>();
  for (const s of sortShifts(data.shifts)) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const offByDate = new Map(data.daysOff.map((d) => [d.date, d.type]));
  // 6 週目が丸ごと翌月なら表示しない
  let cells = calendarGrid(ym.year, ym.month);
  if (!cells.slice(35).some((c) => c.inMonth)) cells = cells.slice(0, 35);

  // 繰り返しの予定は、表示している範囲 (と選んだ日) の 1 回ずつに広げる
  const from = selected < cells[0].iso ? selected : cells[0].iso;
  const to = selected > cells[cells.length - 1].iso ? selected : cells[cells.length - 1].iso;
  const eventsByDate = new Map<string, CalEvent[]>();
  for (const e of expandEvents(data.events, from, to).sort(eventOrder)) eventsByDate.set(e.date, [...(eventsByDate.get(e.date) ?? []), e]);
  const colorOf = (s: Shift) => data.workplaces.find((w) => w.id === s.workplaceId)?.color ?? "var(--accent)";
  const placeOf = (s: Shift) => data.workplaces.find((w) => w.id === s.workplaceId)?.name ?? "";

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
  // シフトと予定を時刻の順に並べる (終日の予定がいちばん上)
  const dayItems = [
    ...dayShifts.map((shift) => ({ kind: "shift" as const, key: shift.start, shift })),
    ...(eventsByDate.get(selected) ?? []).map((event) => ({ kind: "event" as const, key: event.start ?? "", event })),
  ].sort((a, b) => a.key.localeCompare(b.key));

  // 1週間だけ表示しているときは、‹ › とスワイプで週を動かす
  const [weekMode, setWeekMode] = useState(false);
  /** 月を切り替える。選んでいる日もその月に合わせる (今月なら今日、ほかの月は 1日) */
  const move = (delta: number) => {
    const next = addMonths(ym.year, ym.month, delta);
    setYm(next);
    const isThisMonth = next.year === now.getFullYear() && next.month === now.getMonth() + 1;
    onSelect(isThisMonth ? today : `${next.year}-${String(next.month).padStart(2, "0")}-01`);
  };
  /** その日を選んで、その月を表示する */
  const jump = (iso: string) => {
    const d = parseISODate(iso);
    onSelect(iso);
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };
  const step = (dir: 1 | -1) => (weekMode ? jump(addDays(selected, dir * 7)) : move(dir));

  return (
    <div className="home">
      <header className="home-head">
        <button className="big-month" aria-label="今日に戻る" onClick={() => jump(today)}>
          <span className="big-num">{ym.month}</span>
          <span className="big-year">{ym.year}年</span>
        </button>
        <div className="head-actions">
          <button className="round-btn" aria-label={weekMode ? "前の週" : "前の月"} onClick={() => step(-1)}>
            <Icon name="left" />
          </button>
          <button className="round-btn" aria-label={weekMode ? "次の週" : "次の月"} onClick={() => step(1)}>
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

      <MonthGrid
        cells={cells}
        selected={selected}
        today={today}
        onSelect={onSelect}
        shiftsOf={(d) => byDate.get(d) ?? []}
        offOf={(d) => offByDate.get(d)}
        eventsOf={(d) => eventsByDate.get(d) ?? []}
        colorOf={colorOf}
        placeOf={placeOf}
        onSwipe={step}
        onWeekMode={setWeekMode}
      />

      <button className="board" onClick={goList}>
        <svg className="ring" width="64" height="64" viewBox="0 0 64 64" aria-hidden>
          <circle cx="32" cy="32" r={R} className="ring-bg" />
          {/* 0% のときは丸い端だけが点として見えてしまうので描かない */}
          {progress > 0 && (          <circle
              cx="32"
              cy="32"
              r={R}
              className="ring-fg"
              strokeDasharray={`${C * progress} ${C}`}
              transform="rotate(-90 32 32)"
            />)}
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

        {dayItems.map((it) =>
          it.kind === "shift" ? (
            <div key={it.shift.id} className="item">
              <button className="item-main" onClick={() => onEdit(it.shift)}>
                <span className="item-time">{it.shift.start}</span>
                <span className="item-bar" style={{ background: colorOf(it.shift) }} />
                <span className="item-body">
                  <strong>{data.workplaces.find((w) => w.id === it.shift.workplaceId)?.name ?? "シフト"}</strong>
                  <small>
                    {it.shift.start}〜{it.shift.end}・実働 {formatHours(workMinutes(it.shift, rules))}
                    {it.shift.note && `・${it.shift.note}`}
                  </small>
                </span>
              </button>
              <button className="item-del" aria-label={`${it.shift.start}〜${it.shift.end} のシフトを削除`} onClick={() => onDelete(it.shift)}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ) : (
            <div key={it.event.id} className="item event-item">
              <button className="item-main" onClick={() => onEditEvent(it.event)}>
                <span className={`item-time${it.event.start ? "" : " allday"}`}>{it.event.start ?? "終日"}</span>
                <span className="item-bar" style={{ background: it.event.color }} />
                <span className="item-body">
                  <strong>{it.event.title}</strong>
                  {(it.event.start || it.event.note || it.event.repeat) && (
                    <small>
                      {[
                        it.event.start && `${it.event.start}${it.event.end ? `〜${it.event.end}` : ""}`,
                        it.event.repeat && (
                          <span key="r" className="repeat-note">
                            <Icon name="repeat" size={12} strokeWidth={2.2} />
                            {repeatLabel(it.event)}
                          </span>
                        ),
                        it.event.note,
                      ]
                        .filter(Boolean)
                        .flatMap((x, i) => (i ? ["・", x] : [x]))}
                    </small>
                  )}
                </span>
              </button>
              <button className="item-del" aria-label={`予定「${it.event.title}」を削除`} onClick={() => onDeleteEvent(it.event)}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ),
        )}

        {dayItems.length === 0 && !dayOff && <p className="empty">予定はありません</p>}
        <button className="add-line" onClick={() => onAdd(selected)}>
          <Icon name="plus" size={18} /> この日に追加
        </button>
      </section>
    </div>
  );
}
