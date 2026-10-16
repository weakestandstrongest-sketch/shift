import type { CalEvent, Repeat } from "../types";
import { addDays, parseISODate, toISODate, WEEKDAYS } from "./date";

/** 月の第何週の曜日か (1〜5) */
export const nthOf = (d: Date) => Math.ceil(d.getDate() / 7);
/** その月の最後の同じ曜日か */
export const isLastOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7).getMonth() !== d.getMonth();

/** 繰り返しの選び方 (シートの「繰り返し」の選択肢) */
export type RepeatKey = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "monthlyNth" | "monthlyLast" | "yearly";

export function repeatKey(r: Repeat | null | undefined): RepeatKey {
  if (!r) return "none";
  if (r.freq === "monthlyNth") return r.nth === -1 ? "monthlyLast" : "monthlyNth";
  return r.freq;
}

/** 最初の日から決まる選択肢と、その表示名 */
export function repeatOptions(date: string): { key: RepeatKey; label: string }[] {
  const d = parseISODate(date);
  const w = WEEKDAYS[d.getDay()];
  const opts: { key: RepeatKey; label: string }[] = [
    { key: "none", label: "しない" },
    { key: "daily", label: "毎日" },
    { key: "weekdays", label: "平日 (月〜金)" },
    { key: "weekly", label: "毎週" },
    { key: "monthly", label: `毎月${d.getDate()}日` },
    { key: "monthlyNth", label: `毎月第${nthOf(d)}${w}曜日` },
  ];
  if (isLastOfMonth(d)) opts.push({ key: "monthlyLast", label: `毎月最終${w}曜日` });
  opts.push({ key: "yearly", label: `毎年${d.getMonth() + 1}月${d.getDate()}日` });
  return opts;
}

/** 選択肢から繰り返しを作る。曜日などは最初の日 (date) に合わせる */
export function makeRepeat(key: RepeatKey, date: string, days?: number[]): Repeat | null {
  const d = parseISODate(date);
  switch (key) {
    case "none":
      return null;
    case "weekly":
      return { freq: "weekly", days: days?.length ? [...new Set(days)].sort((a, b) => a - b) : [d.getDay()] };
    case "monthlyNth":
      return { freq: "monthlyNth", nth: nthOf(d), weekday: d.getDay() };
    case "monthlyLast":
      return { freq: "monthlyNth", nth: -1, weekday: d.getDay() };
    default:
      return { freq: key };
  }
}

/**
 * 日付が変わったときに繰り返しを合わせ直す (第何曜日など、最初の日から決まる部分)。
 * 「最終」は新しい日が月の最後の週でなければ「第◯」にする。
 */
export function normalizeRepeat(r: Repeat | null | undefined, date: string): Repeat | null {
  if (!r) return null;
  const key = repeatKey(r);
  if (key === "monthlyLast" && !isLastOfMonth(parseISODate(date))) return makeRepeat("monthlyNth", date);
  return makeRepeat(key, date, r.freq === "weekly" ? r.days : undefined);
}

/** 繰り返しの説明 (一覧に出す短い文) */
export function repeatLabel(ev: CalEvent): string {
  const r = ev.repeat;
  if (!r) return "";
  let s: string;
  if (r.freq === "weekly") s = `毎週 ${r.days.map((x) => WEEKDAYS[x]).join("・")}`;
  else s = repeatOptions(ev.date).find((o) => o.key === repeatKey(r))?.label ?? "";
  if (ev.until) {
    const u = parseISODate(ev.until);
    s += ` (${u.getFullYear()}/${u.getMonth() + 1}/${u.getDate()}まで)`;
  }
  return s;
}

/** その予定がその日にあるか */
export function occursOn(ev: CalEvent, iso: string): boolean {
  if (iso < ev.date) return false;
  const r = ev.repeat;
  if (!r) return iso === ev.date;
  if (ev.until && iso > ev.until) return false;
  if (ev.exdates?.includes(iso)) return false;
  const d = parseISODate(iso);
  const b = parseISODate(ev.date);
  switch (r.freq) {
    case "daily":
      return true;
    case "weekdays":
      return d.getDay() >= 1 && d.getDay() <= 5;
    case "weekly":
      return r.days.includes(d.getDay());
    case "monthly":
      return d.getDate() === b.getDate();
    case "monthlyNth":
      return d.getDay() === r.weekday && (r.nth === -1 ? isLastOfMonth(d) : nthOf(d) === r.nth);
    case "yearly":
      return d.getMonth() === b.getMonth() && d.getDate() === b.getDate();
    default:
      return false;
  }
}

/** from〜to (両端を含む) にある予定を、1 日ずつの予定に広げる。date はその日になる */
export function expandEvents(events: CalEvent[], from: string, to: string): CalEvent[] {
  const out: CalEvent[] = [];
  for (const ev of events) {
    if (!ev.repeat) {
      if (ev.date >= from && ev.date <= to) out.push(ev);
      continue;
    }
    let iso = ev.date > from ? ev.date : from;
    const last = ev.until && ev.until < to ? ev.until : to;
    for (; iso <= last; iso = addDays(iso, 1)) if (occursOn(ev, iso)) out.push({ ...ev, date: iso });
  }
  return out;
}

/** 繰り返しの予定を、どこまで変える・消すか */
export type Scope = "this" | "future";

/**
 * 繰り返しの予定の 1 回分 (occDate の日) を編集する。
 * - this: その日だけ別の予定に切り離す (元の繰り返しからはその日を除く)
 * - future: その日以降を新しい内容にする (最初の日ならまるごと置き換え)
 */
export function editOccurrence(events: CalEvent[], seriesId: string, occDate: string, edited: CalEvent, scope: Scope, newId: () => string): CalEvent[] {
  const series = events.find((e) => e.id === seriesId);
  if (!series) return [...events, edited];
  const others = events.filter((e) => e.id !== seriesId);
  if (scope === "this") {
    const single: CalEvent = { ...edited, id: newId(), repeat: null, until: null, exdates: [] };
    return [...others, { ...series, exdates: addExdate(series.exdates, occDate) }, single];
  }
  if (occDate <= series.date) return [...others, { ...edited, id: series.id }];
  const ended = endBefore(series, occDate);
  const next: CalEvent = {
    ...edited,
    id: newId(),
    // 日付を変えていなければ、その日以降に消した日はそのまま引き継ぐ
    exdates: edited.date === occDate ? (series.exdates ?? []).filter((x) => x > occDate) : [],
  };
  return [...others, ...(ended ? [ended] : []), next];
}

/** 消すときは「すべて」も選べる */
export type DeleteScope = Scope | "all";

/** 繰り返しの予定の 1 回分を消す (this: その日だけ / future: その日以降すべて / all: 繰り返しをまるごと) */
export function deleteOccurrence(events: CalEvent[], seriesId: string, occDate: string, scope: DeleteScope): CalEvent[] {
  const series = events.find((e) => e.id === seriesId);
  if (!series) return events;
  const others = events.filter((e) => e.id !== seriesId);
  if (!series.repeat || scope === "all") return others;
  if (scope === "this") {
    const updated = { ...series, exdates: addExdate(series.exdates, occDate) };
    // 1 回も残らなくなったら予定ごと消す
    return hasAnyOccurrence(updated) ? [...others, updated] : others;
  }
  const ended = occDate <= series.date ? null : endBefore(series, occDate);
  return ended ? [...others, ended] : others;
}

const addExdate = (list: string[] | undefined, iso: string) => [...new Set([...(list ?? []), iso])].sort();

/** occDate の前日で繰り返しを終える。1 回も残らなければ null */
function endBefore(series: CalEvent, occDate: string): CalEvent | null {
  const until = addDays(occDate, -1);
  const ended = { ...series, until: series.until && series.until < until ? series.until : until };
  ended.exdates = (series.exdates ?? []).filter((x) => x <= until);
  return hasAnyOccurrence(ended) ? ended : null;
}

/** まだ 1 回でも予定が残っているか (終わりのない繰り返しは、最初の 5 年ほどだけ調べる) */
function hasAnyOccurrence(ev: CalEvent): boolean {
  const end = ev.until ?? toISODate(new Date(parseISODate(ev.date).getFullYear() + 5, 11, 31));
  for (let iso = ev.date; iso <= end; iso = addDays(iso, 1)) if (occursOn(ev, iso)) return true;
  return false;
}
