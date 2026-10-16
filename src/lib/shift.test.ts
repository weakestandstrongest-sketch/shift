import { describe, expect, it } from "vitest";
import type { Shift, Workplace } from "../types";
import { buildICS } from "./ics";
import { toCandidates, type Extraction } from "./extract";
import { lookupCode, shiftsInMonth, summarize, workMinutes } from "./shift";

const shift = (p: Partial<Shift>): Shift => ({
  id: p.id ?? Math.random().toString(36),
  date: "2026-10-01",
  start: "09:00",
  end: "17:00",
  workplaceId: "wp1",
  breakMinutes: 0,
  note: "",
  source: "manual",
  ...p,
});
const wps: Workplace[] = [
  { id: "wp1", name: "カフェ", color: "#000", hourlyWage: 1200 },
  { id: "wp2", name: "塾", color: "#111", hourlyWage: null },
];

describe("workMinutes", () => {
  it("subtracts breaks", () => {
    expect(workMinutes({ start: "09:00", end: "17:00", breakMinutes: 60 })).toBe(420);
  });
  it("handles overnight shifts", () => {
    expect(workMinutes({ start: "22:00", end: "05:00", breakMinutes: 0 })).toBe(420);
  });
});

describe("summarize", () => {
  it("counts days, hours and pay; flags unpriced shifts", () => {
    const list = [
      shift({ date: "2026-10-01", start: "10:00", end: "15:00" }),
      shift({ date: "2026-10-01", start: "18:00", end: "20:00", workplaceId: "wp2" }),
      shift({ date: "2026-10-03", start: "09:00", end: "12:30" }),
    ];
    expect(summarize(list, wps)).toEqual({ days: 2, minutes: 300 + 120 + 210, pay: 6000 + 4200, hasUnpriced: true });
  });
  it("filters by month", () => {
    const list = [shift({ date: "2026-09-30" }), shift({ date: "2026-10-02" }), shift({ date: "2026-10-01" })];
    expect(shiftsInMonth(list, 2026, 10).map((s) => s.date)).toEqual(["2026-10-01", "2026-10-02"]);
  });
});

describe("lookupCode", () => {
  it("matches ignoring width and case", () => {
    const codes = [{ code: "A", start: "09:00", end: "15:00" }, { code: "早", start: "07:00", end: "13:00" }];
    expect(lookupCode("ａ", codes)?.start).toBe("09:00");
    expect(lookupCode(" 早 ", codes)?.end).toBe("13:00");
    expect(lookupCode("遅", codes)).toBeNull();
  });
});

describe("toCandidates", () => {
  const extraction: Extraction = {
    matched_name: "山田",
    names_in_table: [],
    warnings: [],
    days: [
      { date: "2026-10-05", raw: "9-17", kind: "勤務", start: "9:00", end: "17:00", note: "", uncertain: false },
      { date: "2026-10-02", raw: "早", kind: "勤務", start: null, end: null, note: "", uncertain: false },
      { date: "2026-10-03", raw: "17-L", kind: "勤務", start: "17:00", end: null, note: "ラスト", uncertain: true },
      { date: "2026-10-04", raw: "10-14", kind: "勤務", start: "10:00", end: "14:00", note: "", uncertain: false },
      { date: "2026-02-30", raw: "?", kind: "勤務", start: "10:00", end: "14:00", note: "", uncertain: false },
    ],
  };
  const codes = [{ code: "早", start: "07:00", end: "13:00" }];
  const existing = [shift({ date: "2026-10-04", start: "10:00", end: "14:00" })];

  it("resolves codes, flags missing times and duplicates, and drops invalid dates", () => {
    const cs = toCandidates(extraction, { codes, offSymbols: [] }, existing, []).work;
    expect(cs.map((c) => [c.date, c.start, c.end, c.needsTime, c.duplicate, c.selected])).toEqual([
      ["2026-10-02", "07:00", "13:00", false, false, true],
      ["2026-10-03", "17:00", "", true, false, false],
      ["2026-10-04", "10:00", "14:00", false, true, false],
      ["2026-10-05", "09:00", "17:00", false, false, true],
    ]);
  });
});

describe("buildICS", () => {
  it("rolls overnight end times to the next day", () => {
    const ics = buildICS([shift({ id: "x", date: "2026-10-31", start: "22:00", end: "02:00", note: "棚卸し, 夜" })], wps);
    expect(ics).toContain("DTSTART:20261031T220000");
    expect(ics).toContain("DTEND:20261101T020000");
    expect(ics).toContain("SUMMARY:シフト (カフェ)");
    expect(ics).toContain("DESCRIPTION:棚卸し\\, 夜");
  });
});

describe("nightMinutes / isFinished", async () => {
  const { nightMinutes, isFinished } = await import("./shift");
  it.each([
    ["17:00", "22:00", 0],
    ["22:00", "01:00", 180],
    ["21:15", "23:15", 75],
    ["04:00", "09:00", 60],
    ["20:00", "06:00", 420],
  ])("%s〜%s → %i min at night", (start, end, expected) => {
    expect(nightMinutes({ start, end })).toBe(expected);
  });

  const now = new Date(2026, 9, 16, 18, 0); // 10/16 18:00
  it.each([
    ["2026-10-15", "09:30", "16:00", true],
    ["2026-10-16", "09:30", "16:00", true],
    ["2026-10-16", "17:15", "21:15", false],
    ["2026-10-17", "09:30", "16:00", false],
    ["2026-10-15", "22:00", "19:00", false], // 前日 22:00〜今日 19:00 はまだ終わっていない
    ["2026-10-15", "22:00", "01:00", true],
  ])("%s %s〜%s finished: %s", (date, start, end, expected) => {
    expect(isFinished({ date, start, end }, now)).toBe(expected);
  });
});
