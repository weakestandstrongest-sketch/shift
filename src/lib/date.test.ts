import { describe, expect, it } from "vitest";
import { addMonths, calendarGrid, isValidISODate, normalizeTime } from "./date";

describe("normalizeTime", () => {
  it.each([
    ["9:00", "09:00"],
    ["09:30", "09:30"],
    ["９：３０", "09:30"],
    ["17時", "17:00"],
    ["9時半", "09:30"],
    ["1730", "17:30"],
    ["9", "09:00"],
    ["25:00", "01:00"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeTime(input)).toBe(expected);
  });

  it.each([null, "", "早", "30:00", "9:75"])("%s -> null", (input) => {
    expect(normalizeTime(input)).toBeNull();
  });
});

describe("calendarGrid", () => {
  it("starts on Sunday and covers the whole month", () => {
    // 2026-10-01 is a Thursday
    const cells = calendarGrid(2026, 10);
    expect(cells).toHaveLength(42);
    expect(cells[0].iso).toBe("2026-09-27");
    expect(cells[4]).toMatchObject({ iso: "2026-10-01", inMonth: true, weekday: 4 });
    expect(cells.filter((c) => c.inMonth)).toHaveLength(31);
  });
});

describe("misc", () => {
  it("addMonths wraps years", () => {
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
  it("isValidISODate rejects impossible dates", () => {
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2028-02-29")).toBe(true);
    expect(isValidISODate("2026/10/01")).toBe(false);
  });
});
