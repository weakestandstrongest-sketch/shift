export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** "2026-10" 形式 */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

/**
 * 月表示カレンダー用に、日曜始まりで 6 週 (42 マス) 分の日付を返す。
 * 前月・翌月の日付も含む。
 */
export function calendarGrid(year: number, month: number): { iso: string; day: number; inMonth: boolean; weekday: number }[] {
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    cells.push({
      iso: toISODate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1,
      weekday: d.getDay(),
    });
  }
  return cells;
}

export function formatDateJa(iso: string): string {
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}

export function isValidISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
}

/** "9:00" "09:00" "9時" "900" などを "09:00" に正規化。解釈できなければ null */
export function normalizeTime(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.normalize("NFKC").trim().replace("半", "30分");
  const patterns = [/^(\d{1,2}):(\d{2})$/, /^(\d{1,2})時(?:(\d{1,2})分?)?$/, /^(\d{1,2})(\d{2})$/, /^(\d{1,2})$/];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    const h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    // 24:00〜29:59 のような深夜表記も許容する
    if (h > 29 || min > 59) return null;
    return `${pad(h % 24)}:${pad(min)}`;
  }
  return null;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}
