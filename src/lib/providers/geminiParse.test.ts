import { describe, expect, it } from "vitest";
import { migrate } from "../storage";
import { parseGeminiJSON } from "./geminiParse";

describe("parseGeminiJSON", () => {
  it("turns empty strings back into null", () => {
    const r = parseGeminiJSON(
      JSON.stringify({
        matched_name: "山田",
        names_in_table: [],
        warnings: [],
        shifts: [{ date: "2026-10-03", raw: "17-L", start: "17:00", end: "", note: "ラスト", uncertain: true }],
      }),
    );
    expect(r).toEqual({
      matched_name: "山田",
      names_in_table: [],
      warnings: [],
      shifts: [{ date: "2026-10-03", raw: "17-L", start: "17:00", end: null, note: "ラスト", uncertain: true }],
    });
  });

  it("treats an empty matched_name as not found and fills missing fields", () => {
    const r = parseGeminiJSON('```json\n{"matched_name": "", "names_in_table": ["佐藤"]}\n```');
    expect(r).toEqual({ matched_name: null, names_in_table: ["佐藤"], shifts: [], warnings: [] });
  });

  it("returns null for non-JSON or wrong shapes", () => {
    expect(parseGeminiJSON("すみません、読めませんでした")).toBeNull();
    expect(parseGeminiJSON('{"shifts": "none"}')).toBeNull();
  });
});

describe("migrate provider", () => {
  it("defaults new data to gemini", () => {
    expect(migrate({}).settings.provider).toBe("gemini");
  });
  it("keeps users who already set a Claude key on claude", () => {
    const d = migrate({ settings: { myName: "山田", apiKey: "sk-ant-x" } });
    expect(d.settings.provider).toBe("claude");
    expect(d.settings.geminiModel).toBe("gemini-flash-latest");
  });
});
