import { describe, expect, it } from "vitest";
import { backupDue } from "./backup";
import { defaultData } from "./storage";
import type { AppData, Settings } from "../types";

const data = (s: Partial<Settings>, withData = true): AppData => {
  const d = defaultData();
  return {
    ...d,
    settings: { ...d.settings, backupReminderSince: "2026-10-01", ...s },
    events: withData ? [{ id: "e", date: "2026-10-05", title: "x", start: null, end: null, color: "#000", note: "" }] : [],
  };
};

describe("backupDue", () => {
  it("まだバックアップしていなければ、数え始めた日から数える", () => {
    expect(backupDue(data({}), "2026-10-14")).toBeNull();
    expect(backupDue(data({}), "2026-10-15")).toEqual({ days: 14, never: true });
  });
  it("前回のバックアップから数える", () => {
    expect(backupDue(data({ lastBackupAt: "2026-10-10", backupReminderDays: 7 }), "2026-10-16")).toBeNull();
    expect(backupDue(data({ lastBackupAt: "2026-10-10", backupReminderDays: 7 }), "2026-10-17")).toEqual({ days: 7, never: false });
  });
  it("しない / データがない / あとで のときは出さない", () => {
    expect(backupDue(data({ backupReminderDays: 0 }), "2026-12-01")).toBeNull();
    expect(backupDue(data({}, false), "2026-12-01")).toBeNull();
    expect(backupDue(data({ backupSnoozedUntil: "2026-12-03" }), "2026-12-02")).toBeNull();
    expect(backupDue(data({ backupSnoozedUntil: "2026-12-03" }), "2026-12-03")).not.toBeNull();
  });
  it("以前のデータには項目を足し、数え始めるのは読み込んだ日から", async () => {
    const { migrate } = await import("./storage");
    const d = migrate({ settings: { myName: "x" } });
    expect(d.settings.backupReminderDays).toBe(14);
    expect(d.settings.lastBackupAt).toBeNull();
    expect(d.settings.backupReminderSince).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
