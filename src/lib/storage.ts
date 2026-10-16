import type { AppData } from "../types";

const STORAGE_KEY = "shift-app:v1";

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";

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
      defaultWorkplaceId: null,
    },
    workplaces: [],
    shifts: [],
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
