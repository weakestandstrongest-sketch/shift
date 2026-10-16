import { describe, expect, it } from "vitest";
import type { CalEvent, Repeat } from "../types";
import { deleteOccurrence, editOccurrence, expandEvents, makeRepeat, normalizeRepeat, occursOn, repeatLabel, repeatOptions } from "./repeat";

const ev = (date: string, repeat: Repeat | null, extra: Partial<CalEvent> = {}): CalEvent => ({
  id: "e1",
  date,
  title: "予定",
  start: null,
  end: null,
  color: "#3b82f6",
  note: "",
  repeat,
  ...extra,
});
const dates = (e: CalEvent | CalEvent[], from: string, to: string) => expandEvents(Array.isArray(e) ? e : [e], from, to).map((x) => x.date);
let n = 0;
const nid = () => `n${++n}`;

describe("occursOn / expandEvents", () => {
  it("繰り返しなしはその日だけ", () => {
    expect(dates(ev("2026-10-16", null), "2026-10-01", "2026-10-31")).toEqual(["2026-10-16"]);
    expect(dates(ev("2026-11-01", null), "2026-10-01", "2026-10-31")).toEqual([]);
  });
  it("毎日 (最初の日より前は出ない)", () => {
    expect(dates(ev("2026-10-29", { freq: "daily" }), "2026-10-27", "2026-11-02")).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("平日 (月〜金)", () => {
    // 2026-10-16 は金曜
    expect(dates(ev("2026-10-16", { freq: "weekdays" }), "2026-10-16", "2026-10-22")).toEqual(["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("毎週 (曜日を選ぶ)", () => {
    expect(dates(ev("2026-10-05", { freq: "weekly", days: [1, 3] }), "2026-10-01", "2026-10-15")).toEqual(["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14"]);
  });
  it("毎月◯日 (31日がない月はとばす)", () => {
    expect(dates(ev("2026-01-31", { freq: "monthly" }), "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });
  it("毎月第3金曜日", () => {
    expect(dates(ev("2026-10-16", makeRepeat("monthlyNth", "2026-10-16")), "2026-10-01", "2027-01-31")).toEqual(["2026-10-16", "2026-11-20", "2026-12-18", "2027-01-15"]);
  });
  it("毎月第5◯曜日 はない月をとばす / 最終◯曜日 は毎月ある", () => {
    // 2026-10-30 は第5金曜 (最終金曜)
    expect(dates(ev("2026-10-30", makeRepeat("monthlyNth", "2026-10-30")), "2026-10-01", "2027-01-31")).toEqual(["2026-10-30", "2027-01-29"]);
    expect(dates(ev("2026-10-30", makeRepeat("monthlyLast", "2026-10-30")), "2026-10-01", "2027-01-31")).toEqual(["2026-10-30", "2026-11-27", "2026-12-25", "2027-01-29"]);
  });
  it("毎年 (2/29 はうるう年だけ)", () => {
    expect(dates(ev("2026-10-16", { freq: "yearly" }), "2026-01-01", "2028-12-31")).toEqual(["2026-10-16", "2027-10-16", "2028-10-16"]);
    expect(dates(ev("2028-02-29", { freq: "yearly" }), "2028-01-01", "2033-12-31")).toEqual(["2028-02-29", "2032-02-29"]);
  });
  it("終了日と、消した日", () => {
    const e = ev("2026-10-01", { freq: "daily" }, { until: "2026-10-05", exdates: ["2026-10-03"] });
    expect(dates(e, "2026-09-01", "2026-12-31")).toEqual(["2026-10-01", "2026-10-02", "2026-10-04", "2026-10-05"]);
    expect(occursOn(e, "2026-10-06")).toBe(false);
  });
});

describe("選択肢と表示", () => {
  it("最初の日から選択肢の名前が決まる", () => {
    expect(repeatOptions("2026-10-16").map((o) => o.label)).toEqual(["しない", "毎日", "平日 (月〜金)", "毎週", "毎月16日", "毎月第3金曜日", "毎年10月16日"]);
    expect(repeatOptions("2026-10-30").map((o) => o.label)).toContain("毎月最終金曜日");
  });
  it("毎週で曜日を選ばなければ最初の日の曜日", () => {
    expect(makeRepeat("weekly", "2026-10-16", [])).toEqual({ freq: "weekly", days: [5] });
    expect(makeRepeat("weekly", "2026-10-16", [3, 1, 3])).toEqual({ freq: "weekly", days: [1, 3] });
  });
  it("日付を変えたら第◯曜日も合わせる", () => {
    expect(normalizeRepeat({ freq: "monthlyNth", nth: 3, weekday: 5 }, "2026-10-06")).toEqual({ freq: "monthlyNth", nth: 1, weekday: 2 });
    expect(normalizeRepeat({ freq: "monthlyNth", nth: -1, weekday: 5 }, "2026-10-06")).toEqual({ freq: "monthlyNth", nth: 1, weekday: 2 });
    expect(normalizeRepeat(null, "2026-10-06")).toBeNull();
  });
  it("説明文", () => {
    expect(repeatLabel(ev("2026-10-05", { freq: "weekly", days: [1, 3] }))).toBe("毎週 月・水");
    expect(repeatLabel(ev("2026-10-16", { freq: "monthly" }, { until: "2027-03-31" }))).toBe("毎月16日 (2027/3/31まで)");
    expect(repeatLabel(ev("2026-10-16", null))).toBe("");
  });
});

describe("1 回分の編集・削除", () => {
  const series = ev("2026-10-05", { freq: "weekly", days: [1] }, { title: "ジム" });
  it("この日だけ削除", () => {
    const out = deleteOccurrence([series], "e1", "2026-10-12", "this");
    expect(dates(out, "2026-10-01", "2026-10-31")).toEqual(["2026-10-05", "2026-10-19", "2026-10-26"]);
  });
  it("これ以降すべて削除 / 最初の日からならまるごと", () => {
    expect(dates(deleteOccurrence([series], "e1", "2026-10-19", "future"), "2026-10-01", "2026-12-31")).toEqual(["2026-10-05", "2026-10-12"]);
    expect(deleteOccurrence([series], "e1", "2026-10-05", "future")).toEqual([]);
  });
  it("すべての繰り返しを削除 (ほかの予定は残る)", () => {
    const other = ev("2026-10-06", null, { id: "e2" });
    expect(deleteOccurrence([series, other], "e1", "2026-10-19", "all")).toEqual([other]);
  });
  it("1 回も残らなくなったら予定ごと消える", () => {
    const two = ev("2026-10-05", { freq: "daily" }, { until: "2026-10-06" });
    const once = deleteOccurrence([two], "e1", "2026-10-05", "this");
    expect(deleteOccurrence(once, "e1", "2026-10-06", "this")).toEqual([]);
  });
  it("この日だけ編集: 切り離した予定ができる", () => {
    const out = editOccurrence([series], "e1", "2026-10-12", { ...series, date: "2026-10-13", title: "ジム (火曜に)", repeat: { freq: "weekly", days: [1] } }, "this", nid);
    const all = expandEvents(out, "2026-10-01", "2026-10-31").map((x) => `${x.date}:${x.title}`).sort();
    expect(all).toEqual(["2026-10-05:ジム", "2026-10-13:ジム (火曜に)", "2026-10-19:ジム", "2026-10-26:ジム"]);
  });
  it("これ以降すべて編集: 前日で終えて新しい繰り返しに", () => {
    const withEx = { ...series, exdates: ["2026-10-26"] };
    const out = editOccurrence([withEx], "e1", "2026-10-19", { ...withEx, date: "2026-10-19", title: "ヨガ" }, "future", nid);
    const all = expandEvents(out, "2026-10-01", "2026-11-09").map((x) => `${x.date}:${x.title}`).sort();
    expect(all).toEqual(["2026-10-05:ジム", "2026-10-12:ジム", "2026-10-19:ヨガ", "2026-11-02:ヨガ", "2026-11-09:ヨガ"]);
  });
  it("最初の日で「これ以降すべて」はそのまま置き換え", () => {
    const out = editOccurrence([series], "e1", "2026-10-05", { ...series, title: "ヨガ" }, "future", nid);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "e1", title: "ヨガ" });
  });
});

describe("バックアップの読み込み (migrate)", () => {
  it("壊れた繰り返しや予定は直すか捨てる", async () => {
    const { migrate } = await import("./storage");
    const d = migrate({
      events: [
        { id: "a", date: "2026-10-05", title: "ok", start: null, end: null, color: "#000", note: "", repeat: { freq: "weekly", days: [3, 1, 9, "x"] }, until: "bad", exdates: ["2026-10-07", 5] },
        { id: "b", date: "2026-10-05", title: "bad", repeat: { freq: "weekly", days: [] } },
        { id: "c", date: "2026-10-05", title: "nth", repeat: { freq: "monthlyNth", nth: 7, weekday: 1 } },
        { id: "d", date: "10/5", title: "日付が変" },
        null,
        { id: "e", date: "2026-10-05", title: "古い形 (repeat なし)", start: "10:00", end: null, color: "#000", note: "" },
      ],
    });
    expect(d.events.map((e) => e.id)).toEqual(["a", "b", "c", "e"]);
    expect(d.events[0]).toMatchObject({ repeat: { freq: "weekly", days: [1, 3] }, until: null, exdates: ["2026-10-07"] });
    expect(d.events[1].repeat).toBeNull();
    expect(d.events[2].repeat).toBeNull();
    expect(d.events[3]).toMatchObject({ repeat: null, start: "10:00", note: "" });
  });
});
