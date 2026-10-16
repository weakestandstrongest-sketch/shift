import { describe, expect, it } from "vitest";
import { migrate } from "./storage";
import { parseGeminiJSON } from "./geminiParse";

describe("parseGeminiJSON", () => {
  it("turns empty strings back into null", () => {
    const r = parseGeminiJSON(
      JSON.stringify({
        matched_name: "山田",
        names_in_table: [],
        warnings: [],
        days: [
          { date: "2026-10-03", raw: "17-L", kind: "勤務", start: "17:00", end: "", note: "ラスト", uncertain: true },
          { date: "2026-10-04", raw: "*", kind: "よく分からない", start: "", end: "", note: "", uncertain: false },
        ],
      }),
    );
    expect(r).toEqual({
      matched_name: "山田",
      names_in_table: [],
      warnings: [],
      days: [
        { date: "2026-10-03", raw: "17-L", kind: "勤務", start: "17:00", end: null, note: "ラスト", uncertain: true },
        { date: "2026-10-04", raw: "*", kind: "不明", start: null, end: null, note: "", uncertain: false },
      ],
    });
  });

  it("treats an empty matched_name as not found and fills missing fields", () => {
    const r = parseGeminiJSON('```json\n{"matched_name": "", "names_in_table": ["佐藤"]}\n```');
    expect(r).toEqual({ matched_name: null, names_in_table: ["佐藤"], days: [], warnings: [] });
  });

  it("returns null for non-JSON or wrong shapes", () => {
    expect(parseGeminiJSON("すみません、読めませんでした")).toBeNull();
    expect(parseGeminiJSON('{"days": "none"}')).toBeNull();
  });
});

describe("migrate", () => {
  it("fills defaults and drops settings from older versions", () => {
    const d = migrate({ settings: { myName: "山田", apiKey: "sk-ant-x", provider: "claude", model: "x" } });
    expect(d.settings.myName).toBe("山田");
    expect(d.settings.geminiModel).toBe("gemini-flash-latest");
    expect(d.settings).not.toHaveProperty("apiKey");
    expect(d.settings).not.toHaveProperty("provider");
  });
});
