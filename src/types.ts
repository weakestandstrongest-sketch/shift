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
  /** 繰り返し。なし (null / 未設定) なら date の 1 回だけ */
  repeat?: Repeat | null;
  /** 繰り返しの終了日 (この日まで)。null なら終わりなし */
  until?: string | null;
  /** 繰り返しのうち、消した (または別の予定に切り離した) 日 */
  exdates?: string[];
}

/** 予定の繰り返し方。曜日は 0 = 日 〜 6 = 土。日付・月は予定の date (最初の日) から決まる */
export type Repeat =
  | { freq: "daily" }
  /** 平日 (月〜金) */
  | { freq: "weekdays" }
  /** 毎週、選んだ曜日 */
  | { freq: "weekly"; days: number[] }
  /** 毎月、最初の日と同じ日にち (その日がない月はとばす) */
  | { freq: "monthly" }
  /** 毎月第 nth の weekday 曜日 (nth = -1 は最終) */
  | { freq: "monthlyNth"; nth: number; weekday: number }
  /** 毎年、最初の日と同じ月日 */
  | { freq: "yearly" };

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
  /** 何日ごとにバックアップのお知らせを出すか (0 = 出さない) */
  backupReminderDays: number;
  /** 最後にバックアップした日 (YYYY-MM-DD)。まだなら null */
  lastBackupAt: string | null;
  /** お知らせの日数を数え始めた日 (まだバックアップしていないときに使う) */
  backupReminderSince: string;
  /** 「あとで」を押したとき、この日まではお知らせを出さない */
  backupSnoozedUntil: string | null;
}

export interface AppData {
  version: 1;
  settings: Settings;
  workplaces: Workplace[];
  shifts: Shift[];
  daysOff: DayOff[];
  events: CalEvent[];
}
