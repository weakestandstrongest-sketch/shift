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

/** つまみを何 px 動かすと 1 段階進むか */
const STEP = 120;
/** ピンチで指の間を何 px 広げると 1 段階進むか */
const PINCH_STEP = 110;
/** 指を離したときの速さの上限 (段階/ms) */
const MAX_V = 0.02;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
/** 端を越えたら手応えを重くする */
const rubber = (v: number) => (v < 0 ? v / 3 : v > 2 ? 2 + (v - 2) / 3 : v);

/** 指の動きの速さをならして記録する */
class Tracker {
  v = 0;
  private last: number;
  private lastT: number;
  constructor(pos: number, t: number) {
    this.last = pos;
    this.lastT = t;
  }
  push(pos: number, t: number) {
    const dt = Math.max(1, t - this.lastT);
    this.v = 0.7 * ((pos - this.last) / dt) + 0.3 * this.v;
    this.last = pos;
    this.lastT = t;
  }
  /** 離したときの速さ (px/ms)。指を止めてから離したら 0 */
  release(t: number) {
    return t - this.lastT > 80 ? 0 : this.v;
  }
}

/**
 * iOS のカレンダーのように 3 段階で開くカレンダー (0 = 週, 1 = 月, 2 = 詳しい月)。
 * 下のつまみを上下にドラッグ、またはカレンダーを 2 本指でピンチすると指についてきて、
 * 離すと近い段階へばねの動きでなめらかに落ち着く。つまみのタップで次の段階へ。
 * 行の高さ・文字の濃さは CSS 変数 --s から CSS が計算する (styles.css の .mgrid)。
 */
export function MonthGrid(props: Props) {
  const { cells, selected, today, onSelect, shiftsOf, offOf, eventsOf, colorOf, placeOf, onSwipe, onWeekMode } = props;
  const root = useRef<HTMLDivElement>(null);
  const { level, current, animateTo, follow } = useCalendarStage(root);
  const weekMode = level === 0;
  useEffect(() => onWeekMode(weekMode), [weekMode, onWeekMode]);

  const rows: Cell[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  const selRow = Math.max(0, rows.findIndex((r) => r.some((c) => c.iso === selected)));

  /** 速さ (段階/ms) も考えて、近い段階へ落ち着かせる */
  const settle = (velocity: number) => {
    const v = clamp(velocity, -MAX_V, MAX_V);
    animateTo(clamp(Math.round(current.current + v * 160), 0, 2), v);
  };

  // つまみのドラッグ
  const drag = useRef<{ y: number; from: number; track: Tracker; moved: boolean } | null>(null);

  // カレンダーの上の指: 1 本指の左右スワイプで前後へ、2 本指のピンチで段階を変える
  const latest = useRef({ onSwipe, follow, animateTo, settle });
  latest.current = { onSwipe, follow, animateTo, settle };
  /** ピンチの直後に、日付のタップとして扱わないための時刻 */
  const pinchEndedAt = useRef(0);
  useEffect(() => {
    const el = root.current?.querySelector<HTMLElement>(".cal-rows");
    if (!el) return;
    let swipe: { x: number; y: number } | null = null;
    let pinch: { d0: number; from: number; track: Tracker } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const start = (e: TouchEvent) => {
      if (e.touches.length === 1 && !pinch) {
        swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length >= 2 && !pinch) {
        swipe = null;
        const d = dist(e.touches);
        pinch = { d0: d, from: current.current, track: new Tracker(d, e.timeStamp) };
      }
    };
    const move = (e: TouchEvent) => {
      if (!pinch || e.touches.length < 2) return;
      e.preventDefault(); // ページ全体が拡大・スクロールされないように
      const d = dist(e.touches);
      pinch.track.push(d, e.timeStamp);
      // 指を広げると大きく (詳しく)、つまむと小さく (週だけ) なる
      latest.current.follow(rubber(pinch.from + (d - pinch.d0) / PINCH_STEP));
    };
    const end = (e: TouchEvent) => {
      if (pinch) {
        if (e.touches.length >= 2) return;
        latest.current.settle(pinch.track.release(e.timeStamp) / PINCH_STEP);
        pinch = null;
        pinchEndedAt.current = performance.now();
        return;
      }
      const s = swipe;
      swipe = null;
      if (!s || e.type === "touchcancel") return;
      const dx = e.changedTouches[0].clientX - s.x;
      const dy = e.changedTouches[0].clientY - s.y;
      // ななめのスクロールで動かないよう、横にはっきり動かしたときだけ
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) latest.current.onSwipe(dx < 0 ? 1 : -1);
    };
    // Safari の 2 本指ジェスチャー (ページの拡大) を止める
    const gesture = (e: Event) => e.preventDefault();

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    el.addEventListener("gesturestart", gesture);
    el.addEventListener("gesturechange", gesture);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
      el.removeEventListener("gesturestart", gesture);
      el.removeEventListener("gesturechange", gesture);
    };
  }, [current]);

  return (
    <div className="mgrid" ref={root}>
      <div className="cal-head">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`cal-wd wd-${i}`}>
            {w}
          </div>
        ))}
      </div>

      <div className="cal-rows">
        {rows.map((row, i) => {
          const hidden = weekMode && i !== selRow;
          return (
            <div key={row[0].iso} className={`cal-row${i === selRow ? " sel-row" : ""}`} aria-hidden={hidden || undefined}>
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
                    tabIndex={hidden ? -1 : 0}
                    className={`cal-day${c.inMonth ? "" : " out"}${c.iso === selected ? " sel" : ""}${c.iso === today ? " today" : ""}`}
                    onClick={() => performance.now() - pinchEndedAt.current > 350 && onSelect(c.iso)}
                    aria-label={`${c.iso}${list.length ? ` シフト${list.length}件` : ""}${off ? ` ${off}` : ""}${evs.length ? ` 予定${evs.length}件` : ""}`}
                  >
                    <span className={`num wd-${c.weekday}`}>{c.day}</span>
                    {/* ふつうの月: 時刻・休み・予定の点 */}
                    <span className="cell-compact">
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
                    {/* 詳しい月: シフトの時刻と予定の名前 */}
                    {(list.length > 0 || evs.length > 0 || off) && (
                      <span className="cell-detail" aria-hidden>
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
        aria-label={`カレンダーの表示を切り替え (今は${weekMode ? "1週間" : level === 2 ? "詳しい月" : "月"})`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") animateTo(nextStage(current.current));
        }}
        onPointerDown={(e) => {
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // 取れなくてもつまみの上なら動く
          }
          drag.current = { y: e.clientY, from: current.current, track: new Tracker(e.clientY, e.timeStamp), moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dy = e.clientY - d.y;
          if (!d.moved && Math.abs(dy) < 4) return;
          d.moved = true;
          d.track.push(e.clientY, e.timeStamp);
          follow(rubber(d.from + dy / STEP));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (!d.moved) return animateTo(nextStage(current.current));
          settle(d.track.release(e.timeStamp) / STEP);
        }}
        onPointerCancel={() => {
          drag.current = null;
          settle(0);
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
