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
        days: [{ date: "2026-10-02", raw: "930F16", kind: "勤務", start: "09:03", end: "16:00", note: "", uncertain: false }],
      },
      { codes: [], offSymbols: [] },
      [],
      [],
    ).work;
    expect(cs[0]).toMatchObject({ start: "09:30", end: "16:00", needsTime: false, selected: true });
  });
});

describe("days off from the store's symbols", () => {
  it("splits a column into work days and 公休 / 希望休 / 有給, ignoring △", async () => {
    const { toCandidates } = await import("./extract");
    const { DEFAULT_OFF_SYMBOLS } = await import("./storage");
    const day = (d: number, raw: string, kind: "勤務" | "公休" | "希望休" | "有給" | "不明" = "不明") => ({
      date: `2026-10-${String(d).padStart(2, "0")}`,
      raw,
      kind,
      start: null,
      end: null,
      note: "",
      uncertain: false,
    });
    const { work, off } = toCandidates(
      {
        matched_name: "出麹",
        names_in_table: [],
        warnings: [],
        days: [
          day(1, ""), // 空欄 → 公休 (AI の判断が何であっても記号の設定を優先)
          day(2, "930F16", "勤務"),
          day(3, "＊"), // 全角でも * として扱う
          day(6, "有"),
          day(13, "*", "公休"),
          day(26, "△"),
          day(28, "", "勤務"), // 色だけのマスを AI が勤務と誤解しても、空欄なので公休
        ],
      },
      { codes: [], offSymbols: DEFAULT_OFF_SYMBOLS },
      [],
      [{ id: "x", date: "2026-10-06", type: "有給" }],
    );
    expect(work.map((w) => [w.date, w.start, w.end])).toEqual([["2026-10-02", "09:30", "16:00"]]);
    expect(off.map((o) => [o.date, o.type, o.duplicate, o.selected])).toEqual([
      ["2026-10-01", "公休", false, true],
      ["2026-10-03", "希望休", false, true],
      ["2026-10-06", "有給", true, false],
      ["2026-10-13", "希望休", false, true],
      ["2026-10-28", "公休", false, true],
    ]);
  });

  it("falls back to the AI's judgement for symbols the user has not registered", async () => {
    const { toCandidates } = await import("./extract");
    const { off, work } = toCandidates(
      {
        matched_name: "a",
        names_in_table: [],
        warnings: [],
        days: [
          { date: "2026-10-01", raw: "休", kind: "公休", start: null, end: null, note: "", uncertain: false },
          { date: "2026-10-02", raw: "?", kind: "不明", start: null, end: null, note: "", uncertain: false },
        ],
      },
      { codes: [], offSymbols: [] },
      [],
      [],
    );
    expect(off.map((o) => [o.date, o.type])).toEqual([["2026-10-01", "公休"]]);
    expect(work).toEqual([]);
  });
});

describe("re-importing a revised table for the same month", () => {
  const s = (id: string, date: string, start: string, end: string, extra: Partial<Shift> = {}): Shift => ({
    id,
    date,
    start,
    end,
    workplaceId: null,
    breakMinutes: null,
    note: "",
    source: "photo",
    ...extra,
  });
  const old = [
    s("a", "2026-10-02", "09:30", "16:00", { note: "レジ" }), // 変更なし (メモを残す)
    s("b", "2026-10-05", "09:30", "16:00"), // 新しい表では休みに
    s("c", "2026-10-06", "09:30", "16:00"), // 時間が変わる
    s("d", "2026-11-01", "10:00", "15:00"), // 期間外なので残す
  ];
  const oldOff = [
    { id: "o1", date: "2026-10-07", type: "公休" as const }, // 新しい表では勤務に
    { id: "o2", date: "2026-11-02", type: "公休" as const },
  ];
  const fresh = [s("n1", "2026-10-02", "09:30", "16:00"), s("n2", "2026-10-06", "17:15", "21:15"), s("n3", "2026-10-07", "10:30", "17:00")];
  const freshOff = [{ id: "p1", date: "2026-10-05", type: "希望休" as const }];

  it("replaces the covered period instead of doubling it", async () => {
    const { mergeImport } = await import("./extract");
    const r = mergeImport(old, oldOff, fresh, freshOff, { from: "2026-10-01", to: "2026-10-31" });
    const key = (x: Shift) => `${x.date} ${x.start}-${x.end}`;
    expect(r.shifts.map(key).sort()).toEqual([
      "2026-10-02 09:30-16:00",
      "2026-10-06 17:15-21:15",
      "2026-10-07 10:30-17:00",
      "2026-11-01 10:00-15:00",
    ]);
    expect(r.shifts.find((x) => x.date === "2026-10-02")?.note).toBe("レジ");
    expect(r.removed.map((x) => x.id).sort()).toEqual(["b", "c"]);
    expect(r.added.map((x) => x.id).sort()).toEqual(["n2", "n3"]);
    expect(r.daysOff.map((d) => `${d.date} ${d.type}`).sort()).toEqual(["2026-10-05 希望休", "2026-11-02 公休"]);
  });

  it("only adds new shifts when not replacing", async () => {
    const { mergeImport } = await import("./extract");
    const r = mergeImport(old, oldOff, fresh, freshOff, null);
    expect(r.shifts).toHaveLength(old.length + 2);
    expect(r.removed).toEqual([]);
  });
});

describe("break from the cell color", () => {
  it("maps colors (with naming variants) to breaks", async () => {
    const { colorBreak } = await import("./extract");
    const { DEFAULT_COLOR_BREAKS } = await import("./storage");
    expect(colorBreak("緑", DEFAULT_COLOR_BREAKS)).toBe(0);
    expect(colorBreak("水色", DEFAULT_COLOR_BREAKS)).toBe(45);
    expect(colorBreak("青", DEFAULT_COLOR_BREAKS)).toBe(45);
    expect(colorBreak("白", DEFAULT_COLOR_BREAKS)).toBe(60);
    expect(colorBreak("黄色", DEFAULT_COLOR_BREAKS)).toBe(75);
    expect(colorBreak("赤", DEFAULT_COLOR_BREAKS)).toBeNull();
    expect(colorBreak("", DEFAULT_COLOR_BREAKS)).toBeNull();
  });

  it("puts the color's break on the imported shift, and leaves it to the rules otherwise", async () => {
    const { toCandidates } = await import("./extract");
    const { DEFAULT_COLOR_BREAKS } = await import("./storage");
    const day = (n: number, raw: string, color: string) => ({
      date: `2026-10-${String(n).padStart(2, "0")}`, raw, kind: "勤務" as const, color, start: null, end: null, note: "", uncertain: false,
    });
    const { work } = toCandidates(
      { matched_name: "x", names_in_table: [], warnings: [], days: [day(1, "1915F2115", "緑"), day(2, "930F16", "水色"), day(3, "1315F2115", "白"), day(4, "1215F2115", "黄"), day(5, "9-17", "")] },
      { codes: [], offSymbols: [], colorBreaks: DEFAULT_COLOR_BREAKS },
      [],
      [],
    );
    expect(work.map((w) => [w.raw, w.breakMinutes])).toEqual([
      ["1915F2115", 0],
      ["930F16", 45],
      ["1315F2115", 60],
      ["1215F2115", 75],
      ["9-17", null],
    ]);
  });
});

describe("color vs. length-based break", () => {
  it("flags a color whose break disagrees with the length rule (possible misread)", async () => {
    const { toCandidates } = await import("./extract");
    const { DEFAULT_COLOR_BREAKS, DEFAULT_BREAK_RULES } = await import("./storage");
    const day = (n: number, raw: string, color: string) => ({
      date: `2026-10-0${n}`, raw, kind: "勤務" as const, color, start: null, end: null, note: "", uncertain: false,
    });
    const { work } = toCandidates(
      { matched_name: "x", names_in_table: [], warnings: [], days: [day(1, "930F16", "水色"), day(2, "1915F2115", "白")] },
      { codes: [], offSymbols: [], colorBreaks: DEFAULT_COLOR_BREAKS, breakRules: DEFAULT_BREAK_RULES },
      [],
      [],
    );
    expect(work.map((w) => [w.raw, w.breakMinutes, w.ruleBreakIfDifferent])).toEqual([
      ["930F16", 45, null], // 6.5時間・水色 = 45分 → 一致
      ["1915F2115", 60, 0], // 2時間なのに白 (1時間) → 読み違いかも
    ]);
  });
});
