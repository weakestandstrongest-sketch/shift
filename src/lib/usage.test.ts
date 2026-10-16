import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DAILY_LIMIT, nextReset, quotaDay, recordQuotaError, recordRequest, setDailyLimit, summarizeUsage } from "./usage";

// テスト用の localStorage
const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
} as Storage;

describe("Gemini free-tier usage", () => {
  beforeEach(() => store.clear());

  // 2026-10-16 12:00 JST = 2026-10-15 20:00 PDT
  const noonJST = Date.UTC(2026, 9, 16, 3, 0);

  it("counts the day in Pacific time, which resets at 16:00 JST in summer", () => {
    expect(quotaDay(noonJST)).toBe("2026-10-15");
    const reset = nextReset(noonJST);
    expect(reset.getTime()).toBe(Date.UTC(2026, 9, 16, 7, 0)); // 16:00 JST
    expect(quotaDay(reset.getTime())).toBe("2026-10-16");
  });

  it("counts today's and this month's requests against the limit", () => {
    recordRequest(noonJST - 2 * 24 * 3600 * 1000); // 2日前 (今日には数えない)
    recordRequest(noonJST - 60_000);
    recordRequest(noonJST);
    const u = summarizeUsage(noonJST);
    expect(u.today).toBe(2);
    expect(u.limit).toBe(DEFAULT_DAILY_LIMIT);
    expect(u.isEstimate).toBe(true);
    expect(u.remaining).toBe(DEFAULT_DAILY_LIMIT - 2);
  });

  it("learns the real daily limit from Google's quota error and shows 0 left", () => {
    recordRequest(noonJST);
    recordQuotaError(
      "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 50, model: gemini-flash. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier",
      noonJST,
    );
    const u = summarizeUsage(noonJST);
    expect(u.limit).toBe(50);
    expect(u.limitFromGoogle).toBe(true);
    expect(u.remaining).toBe(0);
    // 次の日 (リセット後) はまた使える
    expect(summarizeUsage(nextReset(noonJST).getTime() + 1000).remaining).toBe(50);
  });

  it("ignores per-minute limits and accepts a manual limit", () => {
    recordQuotaError("Quota exceeded ... limit: 10 ... GenerateRequestsPerMinutePerProjectPerModel-FreeTier", noonJST);
    expect(summarizeUsage(noonJST).remaining).toBe(DEFAULT_DAILY_LIMIT);
    setDailyLimit(250);
    expect(summarizeUsage(noonJST)).toMatchObject({ limit: 250, isEstimate: false, limitFromGoogle: false });
  });
});
