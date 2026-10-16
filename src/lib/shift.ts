import type { Shift, ShiftCode, Workplace } from "../types";
import { timeToMinutes } from "./date";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 勤務時間 (分)。終了が開始以前なら翌日にまたがる夜勤として扱う */
export function workMinutes(shift: Pick<Shift, "start" | "end" | "breakMinutes">): number {
  const s = timeToMinutes(shift.start);
  let e = timeToMinutes(shift.end);
  if (e <= s) e += 24 * 60;
  return Math.max(0, e - s - (shift.breakMinutes || 0));
}

export function formatHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function shiftPay(shift: Shift, workplaces: Workplace[]): number | null {
  const wp = workplaces.find((w) => w.id === shift.workplaceId);
  if (!wp || wp.hourlyWage == null) return null;
  return Math.round((workMinutes(shift) / 60) * wp.hourlyWage);
}

export interface MonthSummary {
  days: number;
  minutes: number;
  pay: number;
  /** 時給未設定で給料に含まれていないシフトがあるか */
  hasUnpriced: boolean;
}

export function summarize(shifts: Shift[], workplaces: Workplace[]): MonthSummary {
  const days = new Set(shifts.map((s) => s.date)).size;
  let minutes = 0;
  let pay = 0;
  let hasUnpriced = false;
  for (const s of shifts) {
    minutes += workMinutes(s);
    const p = shiftPay(s, workplaces);
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
