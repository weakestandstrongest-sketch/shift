import type { BreakRule, Shift, ShiftCode, Workplace } from "../types";
import { timeToMinutes } from "./date";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Times = Pick<Shift, "start" | "end" | "breakMinutes">;

/** 拘束時間 (分)。終了が開始以前なら翌日にまたがる夜勤として扱う */
export function spanMinutes(shift: Pick<Shift, "start" | "end">): number {
  const s = timeToMinutes(shift.start);
  let e = timeToMinutes(shift.end);
  if (e <= s) e += 24 * 60;
  return e - s;
}

/** 拘束時間に対して休憩ルールが決める休憩 (分) */
export function ruleBreak(span: number, rules: BreakRule[]): number {
  let b = 0;
  for (const r of rules) if (span >= r.minMinutes && r.breakMinutes > b) b = r.breakMinutes;
  return b;
}

/** 実際の休憩 (分)。手入力があればそれ、なければ休憩ルールから */
export function breakOf(shift: Times, rules: BreakRule[]): number {
  return shift.breakMinutes ?? ruleBreak(spanMinutes(shift), rules);
}

/** 実働時間 (分) = 拘束時間 − 休憩 */
export function workMinutes(shift: Times, rules: BreakRule[] = []): number {
  return Math.max(0, spanMinutes(shift) - breakOf(shift, rules));
}

/** 深夜 (22時〜翌5時) にかかる時間 (分)。休憩の位置は分からないので拘束時間で数える */
export function nightMinutes(shift: Pick<Shift, "start" | "end">): number {
  const s = timeToMinutes(shift.start);
  const e = s + spanMinutes(shift);
  const windows = [
    [0, 5 * 60],
    [22 * 60, 29 * 60],
    [46 * 60, 53 * 60],
  ];
  return windows.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(e, b) - Math.max(s, a)), 0);
}

/** そのシフトが now の時点で終わっているか */
export function isFinished(shift: Pick<Shift, "date" | "start" | "end">, now: Date): boolean {
  const pad = (n: number) => String(n).padStart(2, "0");
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (shift.date < today) {
    // 前日からの夜勤がまだ続いている場合
    const overnight = timeToMinutes(shift.end) <= timeToMinutes(shift.start);
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const y = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;
    if (overnight && shift.date === y) return timeToMinutes(shift.end) <= now.getHours() * 60 + now.getMinutes();
    return true;
  }
  if (shift.date > today) return false;
  const start = timeToMinutes(shift.start);
  const end = timeToMinutes(shift.end);
  return end > start && end <= now.getHours() * 60 + now.getMinutes();
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function shiftPay(shift: Shift, workplaces: Workplace[], rules: BreakRule[] = []): number | null {
  const wp = workplaces.find((w) => w.id === shift.workplaceId);
  if (!wp || wp.hourlyWage == null) return null;
  return Math.round((workMinutes(shift, rules) / 60) * wp.hourlyWage);
}

export interface MonthSummary {
  days: number;
  minutes: number;
  pay: number;
  /** 時給未設定で給料に含まれていないシフトがあるか */
  hasUnpriced: boolean;
}

export function summarize(shifts: Shift[], workplaces: Workplace[], rules: BreakRule[] = []): MonthSummary {
  const days = new Set(shifts.map((s) => s.date)).size;
  let minutes = 0;
  let pay = 0;
  let hasUnpriced = false;
  for (const s of shifts) {
    minutes += workMinutes(s, rules);
    const p = shiftPay(s, workplaces, rules);
    if (p == null) hasUnpriced = true;
    else pay += p;
  }
  return { days, minutes, pay, hasUnpriced };
}

export function shiftsInMonth(shifts: Shift[], year: number, month: number): Shift[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return sortShifts(shifts.filter((s) => s.date.startsWith(prefix)));
}

export function sortShifts(shifts: Shift[]): Shift[] {
  return [...shifts].sort((a, b) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date)));
}

/** 同じ日・同じ時間のシフトがすでにあるか (取り込み時の重複チェック) */
export function isDuplicate(candidate: Pick<Shift, "date" | "start" | "end">, existing: Shift[]): boolean {
  return existing.some((s) => s.date === candidate.date && s.start === candidate.start && s.end === candidate.end);
}

/** 記号 (「早」「A」など) を登録済みの時間に変換する。大文字小文字・全角半角の違いは無視 */
export function lookupCode(label: string, codes: ShiftCode[]): ShiftCode | null {
  const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();
  const key = norm(label);
  if (!key) return null;
  return codes.find((c) => norm(c.code) === key) ?? null;
}
