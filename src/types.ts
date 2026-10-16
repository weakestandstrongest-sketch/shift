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

/** シフト表のマスの色で決まる休憩 (例: 水色 = 45分) */
export interface ColorBreak {
  color: string;
  breakMinutes: number;
}

/** 休みの種類 */
export type OffType = "公休" | "希望休" | "有給";
export const OFF_TYPES: OffType[] = ["公休", "希望休", "有給"];

/** 休みの日 (勤務とは別に記録する) */
export interface DayOff {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  type: OffType;
}

/** シフト表で休みを表す記号。symbol が「空欄」なら何も書かれていないマス。「無視」は読み飛ばす */
export interface OffSymbol {
  symbol: string;
  type: OffType | "無視";
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

/** シフトとは別の、ふつうの予定 (給料や勤務時間には入らない) */
export interface CalEvent {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** HH:MM。null なら終日 */
  start: string | null;
  /** HH:MM。null なら終了時刻なし */
  end: string | null;
  color: string;
  note: string;
}

export interface Settings {
  myName: string;
  /** シフト表での別表記 (苗字だけ、カタカナ、ニックネームなど) */
  aliases: string[];
  /** 写真の読み取りに使う Gemini API のキーとモデル */
  geminiApiKey: string;
  geminiModel: string;
  codes: ShiftCode[];
  offSymbols: OffSymbol[];
  breakRules: BreakRule[];
  /** マスの色と休憩の対応。色が分かるときは休憩ルールより優先する */
  colorBreaks: ColorBreak[];
  /** AI に伝える、このシフト表の読み方 (記号や色の意味など) */
  readingNotes: string;
  defaultWorkplaceId: string | null;
  /** 月間の目標金額 (円)。未設定なら null */
  monthlyGoal: number | null;
}

export interface AppData {
  version: 1;
  settings: Settings;
  workplaces: Workplace[];
  shifts: Shift[];
  daysOff: DayOff[];
  events: CalEvent[];
}
