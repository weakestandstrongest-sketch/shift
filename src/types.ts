export interface Workplace {
  id: string;
  name: string;
  color: string;
  /** 時給 (円)。未設定なら給料計算に含めない */
  hourlyWage: number | null;
}

/** 休憩ルール: 拘束時間が minMinutes 以上なら breakMinutes 分の休憩 */
export interface BreakRule {
  minMinutes: number;
  breakMinutes: number;
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
  /** 休憩 (分)。null なら設定の休憩ルールから自動で決める */
  breakMinutes: number | null;
  note: string;
  source: "manual" | "photo";
}

export interface Settings {
  myName: string;
  /** シフト表での別表記 (苗字だけ、カタカナ、ニックネームなど) */
  aliases: string[];
  /** 写真の読み取りに使う Gemini API のキーとモデル */
  geminiApiKey: string;
  geminiModel: string;
  codes: ShiftCode[];
  breakRules: BreakRule[];
  /** AI に伝える、このシフト表の読み方 (記号や色の意味など) */
  readingNotes: string;
  defaultWorkplaceId: string | null;
}

export interface AppData {
  version: 1;
  settings: Settings;
  workplaces: Workplace[];
  shifts: Shift[];
}
