import type { AppData, BreakRule, ColorBreak, OffSymbol } from "../types";

const STORAGE_KEY = "shift-app:v1";

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

/** 初期値の休憩ルール (〜4h: なし / 4h15m〜: 45分 / 7h〜: 1h / 8h15m〜: 1h15m / 10h〜: 1h30m) */
export const DEFAULT_BREAK_RULES: BreakRule[] = [
  { minMinutes: 4 * 60 + 15, breakMinutes: 45 },
  { minMinutes: 7 * 60, breakMinutes: 60 },
  { minMinutes: 8 * 60 + 15, breakMinutes: 75 },
  { minMinutes: 10 * 60, breakMinutes: 90 },
];

/** 初期値のマスの色と休憩 (勤務先のシフト表: 緑=なし / 水色=45分 / 白=1時間 / 黄=1時間15分) */
export const DEFAULT_COLOR_BREAKS: ColorBreak[] = [
  { color: "緑", breakMinutes: 0 },
  { color: "水色", breakMinutes: 45 },
  { color: "白", breakMinutes: 60 },
  { color: "黄", breakMinutes: 75 },
];

/** 初期値の休みの記号 */
export const DEFAULT_OFF_SYMBOLS: OffSymbol[] = [
  { symbol: "空欄", type: "公休" },
  { symbol: "*", type: "希望休" },
  { symbol: "有", type: "有給" },
  { symbol: "△", type: "無視" },
];

/** 予定の色 */
export const EVENT_COLORS = [
  { color: "#3b82f6", name: "青" },
  { color: "#a970e8", name: "紫" },
  { color: "#34c759", name: "緑" },
  { color: "#f2994a", name: "オレンジ" },
  { color: "#ee7a6e", name: "赤" },
  { color: "#8e8e93", name: "グレー" },
];

export const WORKPLACE_COLORS = ["#2f80ed", "#eb5757", "#27ae60", "#f2994a", "#9b51e0", "#00a3a3", "#d6336c", "#828282"];

export function defaultData(): AppData {
  return {
    version: 1,
    settings: {
      myName: "",
      aliases: [],
      geminiApiKey: "",
      geminiModel: DEFAULT_GEMINI_MODEL,
      codes: [],
      offSymbols: DEFAULT_OFF_SYMBOLS,
      breakRules: DEFAULT_BREAK_RULES,
      colorBreaks: DEFAULT_COLOR_BREAKS,
      readingNotes: "",
      defaultWorkplaceId: null,
      monthlyGoal: null,
    },
    workplaces: [],
    shifts: [],
    daysOff: [],
    events: [],
  };
}

/** 保存データを読み込む。壊れていたり古い形でも、足りない項目はデフォルトで補う */
export function migrate(raw: unknown): AppData {
  const base = defaultData();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Partial<AppData>;
  // 既知の項目だけを取り出す (以前の版にあった不要な項目は捨てる)
  const s = (r.settings ?? {}) as Partial<AppData["settings"]>;
  const settings = Object.fromEntries(
    Object.entries(base.settings).map(([k, v]) => [k, s[k as keyof typeof s] ?? v]),
  ) as AppData["settings"];
  return {
    version: 1,
    settings,
    workplaces: Array.isArray(r.workplaces) ? r.workplaces : [],
    shifts: Array.isArray(r.shifts) ? r.shifts : [],
    daysOff: Array.isArray(r.daysOff) ? r.daysOff : [],
    events: Array.isArray(r.events) ? r.events : [],
  };
}

export function loadData(): AppData {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? migrate(JSON.parse(s)) : defaultData();
  } catch {
    return defaultData();
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ストレージが使えない環境 (プライベートモード等) ではメモリ上だけで動かす
  }
}

/** バックアップ用。API キーは書き出さない */
export function exportJSON(data: AppData): string {
  return JSON.stringify({ ...data, settings: { ...data.settings, geminiApiKey: "" } }, null, 2);
}

export function downloadFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
