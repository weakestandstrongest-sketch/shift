// Gemini 無料枠の使用回数を端末内で数える。
// 無料枠の上限は「1日あたりのリクエスト数」で、米国太平洋時間の 0 時にリセットされる。
// API からは残り回数を取れないので、このアプリが送ったリクエストを自分で数える。

const KEY = "shift-app:usage";
/** 上限がまだ分からないときの目安 (Google から上限エラーが来たら実際の値に置き換わる) */
export const DEFAULT_DAILY_LIMIT = 20;

interface UsageData {
  /** 送ったリクエストの時刻 (ミリ秒)。直近 40 日分だけ残す */
  requests: number[];
  /** 1日の上限。null なら目安を使う */
  dailyLimit: number | null;
  /** Google のエラーから分かった上限か */
  limitFromGoogle: boolean;
  /** 上限エラーが出た日 (太平洋時間の日付)。その日は残り 0 回として表示する */
  exhaustedDay: string | null;
}

const empty = (): UsageData => ({ requests: [], dailyLimit: null, limitFromGoogle: false, exhaustedDay: null });

export function loadUsage(): UsageData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return raw && Array.isArray(raw.requests) ? { ...empty(), ...raw } : empty();
  } catch {
    return empty();
  }
}

function saveUsage(u: UsageData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(u));
  } catch {
    // 保存できない環境では数えない
  }
}

const pacific = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
/** 無料枠の「1日」の区切り (太平洋時間の日付 YYYY-MM-DD) */
export function quotaDay(t: number): string {
  return pacific.format(new Date(t));
}

/** 次に無料枠がリセットされる時刻 (太平洋時間の 0 時。日本時間ではちょうどの時刻になる) */
export function nextReset(now: number): Date {
  const today = quotaDay(now);
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  for (let i = 0; i < 26; i++) {
    d.setHours(d.getHours() + 1);
    if (quotaDay(d.getTime()) !== today) return d;
  }
  return d;
}

export function recordRequest(now = Date.now()): void {
  const u = loadUsage();
  const cutoff = now - 40 * 24 * 60 * 60 * 1000;
  u.requests = [...u.requests.filter((t) => t > cutoff), now];
  saveUsage(u);
}

/**
 * 429 (上限) エラーのメッセージから 1日の上限を読み取って覚える。
 * 例: "Quota exceeded for metric: ...free_tier_requests, limit: 20 ... PerDay..."
 */
export function recordQuotaError(message: string, now = Date.now()): void {
  const u = loadUsage();
  const perMinute = /per\s*minute|PerMinute/i.test(message);
  if (!perMinute) {
    u.exhaustedDay = quotaDay(now);
    const m = message.match(/limit:\s*(\d+)/i);
    if (m && Number(m[1]) > 0) {
      u.dailyLimit = Number(m[1]);
      u.limitFromGoogle = true;
    }
  }
  saveUsage(u);
}

export function setDailyLimit(limit: number | null): void {
  const u = loadUsage();
  u.dailyLimit = limit && limit > 0 ? limit : null;
  u.limitFromGoogle = false;
  saveUsage(u);
}

export interface UsageSummary {
  today: number;
  month: number;
  limit: number;
  limitFromGoogle: boolean;
  isEstimate: boolean;
  remaining: number;
  resetAt: Date;
}

export function summarizeUsage(now = Date.now(), u = loadUsage()): UsageSummary {
  const day = quotaDay(now);
  const d = new Date(now);
  const today = u.requests.filter((t) => quotaDay(t) === day).length;
  const month = u.requests.filter((t) => {
    const x = new Date(t);
    return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
  }).length;
  const limit = u.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  const remaining = u.exhaustedDay === day ? 0 : Math.max(0, limit - today);
  return { today, month, limit, limitFromGoogle: u.limitFromGoogle, isEstimate: u.dailyLimit == null, remaining, resetAt: nextReset(now) };
}
