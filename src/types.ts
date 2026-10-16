export interface Workplace {
  id: string;
  name: string;
  color: string;
  /** 時給 (円)。未設定なら給料計算に含めない */
  hourlyWage: number | null;
}

/** シフト表の記号 (例: 「早」= 9:00〜17:00) */
export interface ShiftCode {
  code: string;
  start: string;
  end: string;
}

export interface Shift {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM。start より前なら翌日終わり (夜勤) */
  end: string;
  workplaceId: string | null;
  breakMinutes: number;
  note: string;
  source: "manual" | "photo";
}

/** 写真の読み取りに使う AI。gemini は無料枠あり、claude は有料 */
export type Provider = "gemini" | "claude";

export interface Settings {
  myName: string;
  /** シフト表での別表記 (苗字だけ、カタカナ、ニックネームなど) */
  aliases: string[];
  provider: Provider;
  geminiApiKey: string;
  geminiModel: string;
  /** Anthropic (Claude) の API キー */
  apiKey: string;
  /** Claude のモデル */
  model: string;
  codes: ShiftCode[];
  defaultWorkplaceId: string | null;
}

export interface AppData {
  version: 1;
  settings: Settings;
  workplaces: Workplace[];
  shifts: Shift[];
}
