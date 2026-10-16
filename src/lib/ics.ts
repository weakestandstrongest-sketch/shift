import type { Shift, Workplace } from "../types";
import { parseISODate, timeToMinutes } from "./date";

const pad = (n: number) => String(n).padStart(2, "0");

function icsLocal(date: string, time: string, addDay: boolean): string {
  const d = parseISODate(date);
  if (addDay) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${time.replace(":", "")}00`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
}

/** Google カレンダーや iPhone のカレンダーに読み込める .ics を作る (時刻は端末のローカル時間) */
export function buildICS(shifts: Shift[], workplaces: Workplace[]): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//shift-app//JA", "CALSCALE:GREGORIAN"];
  for (const s of shifts) {
    const wp = workplaces.find((w) => w.id === s.workplaceId);
    const overnight = timeToMinutes(s.end) <= timeToMinutes(s.start);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@shift-app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(s.date, s.start, false)}`,
      `DTEND:${icsLocal(s.date, s.end, overnight)}`,
      `SUMMARY:${escapeText(wp ? `シフト (${wp.name})` : "シフト")}`,
    );
    if (s.note) lines.push(`DESCRIPTION:${escapeText(s.note)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
