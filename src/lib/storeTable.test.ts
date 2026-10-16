import { describe, expect, it } from "vitest";
import type { Shift } from "../types";
import { parseTimeRange } from "./date";
import { ruleBreak, summarize } from "./shift";
import { DEFAULT_BREAK_RULES } from "./storage";

// 実際のシフト表 (2026年10月) の書き方で確認する
describe("parseTimeRange", () => {
  it.each([
    ["1915F2115", "19:15", "21:15"],
    ["930F16", "09:30", "16:00"],
    ["1030F17", "10:30", "17:00"],
    ["16F20", "16:00", "20:00"],
    ["11F17", "11:00", "17:00"],
    ["1130F21", "11:30", "21:00"],
    ["1330F2030", "13:30", "20:30"],
    ["9-17", "09:00", "17:00"],
    ["9:00〜17:30", "09:00", "17:30"],
  ])("%s -> %s〜%s", (raw, start, end) => {
    expect(parseTimeRange(raw)).toEqual({ start, end });
  });

  it("leaves the end empty when it is not written", () => {
    expect(parseTimeRange("17-L")).toEqual({ start: "17:00", end: null });
  });

  it.each(["*", "有", "△", "早", ""])("ignores non-time cells: %s", (raw) => {
    expect(parseTimeRange(raw)).toBeNull();
  });
});

describe("default break rules", () => {
  it.each([
    [4 * 60, 0],
    [4 * 60 + 15, 45],
    [6 * 60 + 45, 45],
    [7 * 60, 60],
    [8 * 60, 60],
    [8 * 60 + 15, 75],
    [9 * 60 + 45, 75],
    [10 * 60, 90],
  ])("span %i min -> break %i min", (span, expected) => {
    expect(ruleBreak(span, DEFAULT_BREAK_RULES)).toBe(expected);
  });

  it("reproduces the table's own total (板倉: 14 days, 110.5 hours)", () => {
    const cells: [number, string][] = [
      [4, "1215F2115"], [5, "1215F2115"], [8, "1130F21"], [9, "1130F21"], [10, "1215F2115"],
      [11, "1215F2115"], [12, "1215F2115"], [15, "1030F1930"], [22, "930F1830"], [26, "1130F21"],
      [28, "1215F2115"], [29, "1215F2115"], [30, "1130F21"], [31, "1215F2115"],
    ];
    const shifts: Shift[] = cells.map(([day, raw]) => {
      const r = parseTimeRange(raw)!;
      return { id: raw + day, date: `2026-10-${String(day).padStart(2, "0")}`, start: r.start, end: r.end!, workplaceId: null, breakMinutes: null, note: "", source: "photo" };
    });
    const sum = summarize(shifts, [], DEFAULT_BREAK_RULES);
    expect(sum.days).toBe(14);
    expect(sum.minutes / 60).toBe(110.5);
  });
});

describe("toCandidates trusts the written code over the AI's conversion", () => {
  it("fixes a misconverted time from the raw cell text", async () => {
    const { toCandidates } = await import("./extract");
    const cs = toCandidates(
      {
        matched_name: "出麹",
        names_in_table: [],
        warnings: [],
        shifts: [{ date: "2026-10-02", raw: "930F16", start: "09:03", end: "16:00", note: "", uncertain: false }],
      },
      [],
      [],
    );
    expect(cs[0]).toMatchObject({ start: "09:30", end: "16:00", needsTime: false, selected: true });
  });
});
