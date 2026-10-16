import { useEffect, useRef } from "react";
import type { CalEvent, OffType, Shift } from "../types";
import { WEEKDAYS } from "../lib/date";
import { useCalendarStage } from "../lib/useCalendarStage";

interface Cell {
  iso: string;
  day: number;
  inMonth: boolean;
  weekday: number;
}

interface Props {
  cells: Cell[];
  selected: string;
  today: string;
  onSelect: (iso: string) => void;
  shiftsOf: (iso: string) => Shift[];
  offOf: (iso: string) => OffType | undefined;
  eventsOf: (iso: string) => CalEvent[];
  colorOf: (s: Shift) => string;
  placeOf: (s: Shift) => string;
  /** 左右スワイプ (-1 = 前、1 = 次) */
  onSwipe: (dir: 1 | -1) => void;
  /** 1週間だけの表示になった / 戻ったとき */
  onWeekMode: (weekMode: boolean) => void;
}

const ROW_COMPACT = 58;
const ROW_DETAIL = 108;
/** 指を何 px 動かすと 1 段階進むか */
const STEP = 120;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * iOS のカレンダーのように 3 段階で開くカレンダー。
 * 下のつまみを上下にドラッグすると指についてきて、離すと近い段階へなめらかに動く。タップで次の段階へ。
 */
export function MonthGrid(props: Props) {
  const { cells, selected, today, onSelect, shiftsOf, offOf, eventsOf, colorOf, placeOf, onSwipe, onWeekMode } = props;
  // 段階の値は毎フレーム変わるので、このコンポーネントの中だけで持つ (ホーム全体を描き直さない)
  const { stage, current, animateTo, follow } = useCalendarStage();
  const weekMode = stage < 0.5;
  useEffect(() => onWeekMode(weekMode), [weekMode, onWeekMode]);

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const selRow = Math.max(0, rows.findIndex((r) => r.some((c) => c.iso === selected)));

  // 段階から、行の高さと文字の見え方を計算する (毎フレーム)
  const detail = clamp(stage - 1, 0, 1); // 0 → 1 で予定の名前が見えてくる
  const others = clamp(stage, 0, 1); // 0 → 1 で選んだ週以外の行が開く
  const rowHeight = (i: number) => {
    if (stage >= 1) return lerp(ROW_COMPACT, ROW_DETAIL, detail);
    return i === selRow ? ROW_COMPACT : lerp(0, ROW_COMPACT, others);
  };

  // つまみのドラッグ
  const drag = useRef<{ y: number; from: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
  const settle = (target: number, velocity = 0) => animateTo(target, velocity);

  // カレンダーの左右スワイプ
  const touch = useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="mgrid">
      <div className="cal-head">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-wd wd-${i}`}>
            {w}
          </div>
        ))}
      </div>

      <div
        className="cal-rows"
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const s = touch.current;
          touch.current = null;
          if (!s) return;
          const dx = e.changedTouches[0].clientX - s.x;
          const dy = e.changedTouches[0].clientY - s.y;
          // ななめのスクロールで動かないよう、横にはっきり動かしたときだけ
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
        }}
      >
        {rows.map((row, i) => {
          const h = rowHeight(i);
          const hidden = stage < 1 && i !== selRow;
          return (
            <div
              key={row[0].iso}
              className="cal-row"
              style={{ height: h, opacity: hidden ? others : 1 }}
              aria-hidden={hidden && others < 0.05 ? true : undefined}
            >
              {row.map((c) => {
                const list = shiftsOf(c.iso);
                const off = offOf(c.iso);
                const evs = eventsOf(c.iso);
                const items = [
                  ...list.map((s) => ({ key: s.id, text: s.start.replace(/^0/, ""), title: placeOf(s), color: colorOf(s) })),
                  ...evs.map((e) => ({ key: e.id, text: e.title, title: e.title, color: e.color })),
                ];
                return (
                  <button
                    key={c.iso}
                    tabIndex={hidden && others < 0.05 ? -1 : 0}
                    className={`cal-day${c.inMonth ? "" : " out"}${c.iso === selected ? " sel" : ""}${c.iso === today ? " today" : ""}`}
                    onClick={() => onSelect(c.iso)}
                    aria-label={`${c.iso}${list.length ? ` シフト${list.length}件` : ""}${off ? ` ${off}` : ""}${evs.length ? ` 予定${evs.length}件` : ""}`}
                  >
                    <span className={`num wd-${c.weekday}`}>{c.day}</span>
                    {/* ふつうの月: 時刻・休み・予定の点 */}
                    <span className="cell-compact" style={{ opacity: 1 - detail }}>
                      {list.length > 0 && (
                        <span className="cal-shift" style={{ color: colorOf(list[0]) }}>
                          {list[0].start.replace(/^0/, "")}
                          {list.length > 1 && <small>+{list.length - 1}</small>}
                        </span>
                      )}
                      {list.length === 0 && off && <span className={`cal-off off-${off}`}>{off}</span>}
                      {evs.length > 0 && (
                        <span className="cal-dots" aria-hidden>
                          {evs.slice(0, 3).map((e) => (
                            <i key={e.id} style={{ background: e.color }} />
                          ))}
                        </span>
                      )}
                    </span>
                    {/* 詳しい月: シフトと予定の名前 */}
                    {detail > 0 && (
                      <span className="cell-detail" style={{ opacity: detail }} aria-hidden>
                        {list.length === 0 && off && <span className={`cd-off off-${off}`}>{off}</span>}
                        {items.slice(0, items.length > 4 ? 3 : 4).map((it) => (
                          <span key={it.key} className="cd-item" title={it.title} style={{ ["--c" as string]: it.color }}>
                            {it.text}
                          </span>
                        ))}
                        {items.length > 4 && <span className="cd-more">他{items.length - 3}件</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div
        className="cal-grabber"
        role="button"
        tabIndex={0}
        aria-label={`カレンダーの表示を切り替え (今は${weekMode ? "1週間" : stage > 1.5 ? "詳しい月" : "月"})`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") settle(nextStage(current.current));
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, from: current.current, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.abs(dy) < 4) return;
          d.moved = true;
          const dt = Math.max(1, e.timeStamp - d.lastT);
          d.v = 0.7 * ((e.clientY - d.lastY) / dt) + 0.3 * d.v; // px/ms (少しならす)
          d.lastY = e.clientY;
          d.lastT = e.timeStamp;
          // 端を越えたら手応えを重くする
          let v = d.from + dy / STEP;
          if (v < 0) v = v / 3;
          if (v > 2) v = 2 + (v - 2) / 3;
          follow(v);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (!d.moved) return settle(nextStage(current.current));
          // 指を止めてから離したときは勢いなし
          const px = e.timeStamp - d.lastT > 80 ? 0 : d.v;
          // 指を離したときの勢いも考えて近い段階へ。速さはそのまま引き継ぐ
          const v = clamp(px / STEP, -0.02, 0.02); // 段階/ms
          const projected = current.current + v * 160;
          settle(clamp(Math.round(projected), 0, 2), v);
        }}
        onPointerCancel={() => {
          drag.current = null;
          settle(clamp(Math.round(current.current), 0, 2));
        }}
      >
        <span />
      </div>
    </div>
  );
}

/** タップしたときの次の段階: 月 → 詳しい月 → 週 → 月 */
function nextStage(v: number): number {
  const s = Math.round(v);
  return s === 1 ? 2 : s === 2 ? 0 : 1;
}
