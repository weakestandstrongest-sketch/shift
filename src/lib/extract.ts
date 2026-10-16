import type { ColorBreak, DayOff, OffSymbol, OffType, Settings, Shift, ShiftCode } from "../types";
import { OFF_TYPES } from "../types";
import { isValidISODate, normalizeTime, parseTimeRange, todayISO } from "./date";
import type { PreparedImage } from "./image";
import { isDuplicate, lookupCode, newId } from "./shift";

export type DayKind = "勤務" | OffType | "不明";
export const DAY_KINDS: DayKind[] = ["勤務", ...OFF_TYPES, "不明"];

/** 写真から読み取った結果 */
export interface Extraction {
  /** シフト表の中で本人として扱った表記。見つからなければ null */
  matched_name: string | null;
  /** 本人が見つからなかったときに、表に載っていた名前の一覧 */
  names_in_table: string[];
  /** 本人の列の 1 日 1 件 (勤務でない日も含む) */
  days: {
    date: string;
    /** マスの文字そのまま。何も書かれていなければ空文字 */
    raw: string;
    kind: DayKind;
    /** マスの背景色 (緑 / 水色 / 白 / 黄 など)。分からなければ空文字 */
    color?: string;
    start: string | null;
    end: string | null;
    note: string;
    uncertain: boolean;
  }[];
  warnings: string[];
}

export const SYSTEM_PROMPT = `あなたは、アルバイトやパートのシフト表の写真から、指定された1人分の勤務予定を正確に読み取るアシスタントです。

読み取りのルール:
- シフト表の形式はさまざまです (名前が行・日付が列の月間表、日ごとの時間帯バー表、手書きの表、LINE のスクリーンショットなど)。まず表の構造を把握してから、指定された人の行・列・枠だけを読んでください。
- 本人の列 (または行) は、表の見出しにある名前で決めます。備考欄・週報・担当欄など、見出し以外の場所に同じ名前が書かれていても、それは本人の勤務ではありません。
- 名前は「本人の名前」と「別表記」のどれかに一致するものを探します。苗字だけ・名前だけ・カタカナ/ひらがな・敬称付き・一部が欠けた表記も同一人物として扱って構いません。似た名前の別人 (同じ苗字の人が複数いる等) がいる場合は、より一致度の高い方を選び、warnings に書いてください。
- 本人が見つからない場合は matched_name を null、days を空にし、names_in_table に表に載っている名前を書いてください。
- 表に載っている日付それぞれについて、本人のマスを 1 日 1 件ずつ days に入れます。勤務でない日 (空欄や休みの記号の日) も省略せずに入れてください。
- kind はその日の種類です: 勤務 / 公休 / 希望休 / 有給 / 不明。ユーザーが登録した「休みの記号」があればそれに従います。なければ一般的な意味 (休・公 → 公休、希望 → 希望休、有 → 有給) で判断し、分からなければ 不明 にします。
- date は YYYY-MM-DD。表に年が書かれていなければ、基準日に最も近くなる年を選んでください (例: 基準日が 2026年12月で表が1月なら 2027年)。
- raw にはそのマスに書かれている文字をそのまま入れます (例: "9-17", "早", "A", "17:00〜L", "1915F2115", "*", "有")。何も書かれていないマス (色が塗られているだけのマスを含む) は空文字にします。
- 「1915F2115」「930F16」「16F20」のように、開始と終了の時刻が F などの文字でつながれていることがあります。「1915F2115」は 19:15〜21:15、「930F16」は 9:30〜16:00 です。数字を1桁も読み落とさないよう注意してください。
- color にはそのマスの背景色を、白 / 緑 / 水色 / 黄 / 赤 / オレンジ / グレー / その他 から一番近いものを書きます。色が塗られていなければ 白 です。色で休憩時間が決まっている表があるので、勤務の日は特によく見てください。
- start / end は勤務の日だけ書きます。24 時間表記の HH:MM。日付をまたぐ場合は "25:00" のように 24 以上で書いて構いません。
- 「早」「遅」「A」のような記号だけのマスは、写真内の凡例か、ユーザーが登録した記号の対応表から時間を決めてください。どちらからも分からなければ start / end を null にします。
- 「L」「ラスト」「締め」「〜CL」など終了時刻が書かれていない場合は end を null にし、note に理由を書きます。
- 読みにくい・自信がないマスは uncertain を true にします。推測で埋めずに、分かったことだけを書いてください。
- 休憩時間・担当・ポジションなどの補足があれば note に短く書きます。`;

export function buildUserText(settings: Settings, targetMonth: string | null): string {
  const names = [settings.myName, ...settings.aliases].filter(Boolean);
  const lines = [
    `本人の名前: ${settings.myName}`,
    `別表記: ${names.length > 1 ? names.slice(1).join(" / ") : "なし"}`,
    `基準日 (今日): ${todayISO()}`,
  ];
  if (targetMonth) lines.push(`このシフト表は ${targetMonth.replace("-", "年")}月 のものです。`);
  if (settings.codes.length > 0) {
    lines.push("登録済みの記号:");
    for (const c of settings.codes) lines.push(`- ${c.code} = ${c.start}〜${c.end}`);
  }
  if (settings.offSymbols.length > 0) {
    lines.push("休みの記号 (シフト表でこう書かれていたら、その種類の日):");
    for (const o of settings.offSymbols) {
      const sym = o.symbol === "空欄" ? "何も書かれていないマス (時間の書かれていない色だけのマスも含む)" : `「${o.symbol}」`;
      lines.push(`- ${sym} = ${o.type === "無視" ? "意味のない記号 (kind は 不明)" : o.type}`);
    }
  }
  if (settings.readingNotes.trim()) {
    lines.push("", "このシフト表の読み方メモ (ユーザーが書いたもの。上のルールより優先してください):", settings.readingNotes.trim());
  }
  lines.push("", "添付したシフト表の写真から、本人の各日の予定をすべて書き出してください。");
  return lines.join("\n");
}

export class ExtractionError extends Error {}

export interface GeminiRequest {
  images: PreparedImage[];
  system: string;
  userText: string;
  apiKey: string;
  model: string;
}

/** 写真 (複数枚可) を Gemini に送り、本人のシフトを読み取る */
export async function extractShifts(images: PreparedImage[], settings: Settings, targetMonth: string | null): Promise<Extraction> {
  if (!settings.myName.trim()) throw new ExtractionError("設定画面で自分の名前を入力してください。");
  if (!settings.geminiApiKey) throw new ExtractionError("設定画面で Gemini API キーを入力してください。");

  // API キーは利用者の端末内だけに保存し、ブラウザから Gemini API を直接呼び出す (個人用アプリとしての設計)。
  // SDK が大きいので、読み取りのときだけ読み込む
  const { extractWithGemini } = await import("./gemini");
  return extractWithGemini({
    images,
    system: SYSTEM_PROMPT,
    userText: buildUserText(settings, targetMonth),
    apiKey: settings.geminiApiKey,
    model: settings.geminiModel,
  });
}

/** 取り込み画面で確認・修正するための勤務の候補 */
export interface Candidate {
  key: string;
  date: string;
  start: string;
  end: string;
  raw: string;
  note: string;
  uncertain: boolean;
  /** 時間が分からず手入力が必要 */
  needsTime: boolean;
  duplicate: boolean;
  selected: boolean;
  /** マスの色 (分かれば) */
  color: string;
  /** マスの色から決まった休憩 (分)。null なら休憩ルールで自動 */
  breakMinutes: number | null;
}

/** 取り込み画面で確認するための休みの候補 */
export interface OffCandidate {
  key: string;
  date: string;
  type: OffType;
  raw: string;
  /** 同じ日に同じ種類の休みが登録済み */
  duplicate: boolean;
  selected: boolean;
}

const norm = (s: string) => s.normalize("NFKC").trim();

// 色の呼び方のゆれをそろえる (青 → 水色、黄色 → 黄 など)
const COLOR_NAMES: [RegExp, string][] = [
  [/緑|グリーン|green/i, "緑"],
  [/水色|青|ブルー|blue|cyan|シアン/i, "水色"],
  [/黄|イエロー|yellow/i, "黄"],
  [/白|ホワイト|white|なし|無色/i, "白"],
  [/赤|ピンク|red|pink/i, "赤"],
  [/オレンジ|橙|orange/i, "オレンジ"],
  [/灰|グレー|gray|grey/i, "グレー"],
];
export function canonicalColor(color: string): string {
  const c = norm(color);
  return COLOR_NAMES.find(([re]) => re.test(c))?.[1] ?? c;
}

/** マスの色に対応する休憩 (分)。対応がなければ null */
export function colorBreak(color: string | undefined, list: ColorBreak[]): number | null {
  if (!color?.trim()) return null;
  const c = canonicalColor(color);
  return list.find((x) => x.color.trim() && canonicalColor(x.color) === c)?.breakMinutes ?? null;
}

/** マスの文字が登録済みの休みの記号に当たるか。「空欄」は何も書かれていないマス */
export function matchOffSymbol(raw: string, symbols: OffSymbol[]): OffSymbol | null {
  const r = norm(raw);
  return symbols.find((o) => (norm(o.symbol) === "空欄" ? r === "" : norm(o.symbol) === r && r !== "")) ?? null;
}

/**
 * AI の読み取り結果を、勤務と休みの候補に分ける。
 * 判断の順番: 休みの記号 → 時刻の書かれたマス → シフト記号 → AI の判断
 */
export function toCandidates(
  result: Extraction,
  settings: Pick<Settings, "codes" | "offSymbols"> & Partial<Pick<Settings, "colorBreaks">>,
  existingShifts: Shift[],
  existingDaysOff: DayOff[],
): { work: Candidate[]; off: OffCandidate[] } {
  const work: Candidate[] = [];
  const off: OffCandidate[] = [];
  const addOff = (date: string, type: OffType, raw: string) => {
    const duplicate = existingDaysOff.some((d) => d.date === date && d.type === type);
    off.push({ key: newId(), date, type, raw, duplicate, selected: !duplicate });
  };

  for (const d of result.days) {
    if (!isValidISODate(d.date)) continue;

    const sym = matchOffSymbol(d.raw, settings.offSymbols);
    if (sym) {
      if (sym.type !== "無視") addOff(d.date, sym.type, d.raw);
      continue;
    }

    let start = normalizeTime(d.start);
    let end = normalizeTime(d.end);
    // 「1915F2115」のように時刻が書かれたマスは、AI の変換より表の文字そのものを信じる
    const range = parseTimeRange(d.raw);
    if (range) {
      start = range.start;
      end = range.end ?? end;
    }
    const code: ShiftCode | null = lookupCode(d.raw, settings.codes);
    if (code) {
      start ??= code.start;
      end ??= code.end;
    }

    const isWork = Boolean(range || code || start || d.kind === "勤務");
    if (!isWork) {
      if (d.kind !== "不明" && d.kind !== "勤務") addOff(d.date, d.kind, d.raw);
      continue;
    }

    const needsTime = !start || !end;
    const c = { date: d.date, start: start ?? "", end: end ?? "" };
    const duplicate = !needsTime && isDuplicate(c, existingShifts);
    work.push({
      key: newId(),
      ...c,
      raw: d.raw,
      note: d.note,
      uncertain: d.uncertain,
      needsTime,
      duplicate,
      selected: !needsTime && !duplicate,
      color: d.color ? canonicalColor(d.color) : "",
      breakMinutes: colorBreak(d.color, settings.colorBreaks ?? []),
    });
  }
  work.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  off.sort((a, b) => a.date.localeCompare(b.date));
  return { work, off };
}

/** 読み取った表が対象にしている期間 (最初の日〜最後の日)。日付がなければ null */
export function coveredRange(result: Extraction): { from: string; to: string } | null {
  const dates = result.days.map((d) => d.date).filter(isValidISODate).sort();
  return dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null;
}

/**
 * 取り込んだシフトを今のデータに合わせる。
 * range を渡すと「新しいシフト表で置き換える」: その期間の古い予定は新しい表に合わせて入れ替える。
 * 時間が同じシフトは古いもの (休憩やメモの手直しを含む) をそのまま残す。
 */
export function mergeImport(
  existingShifts: Shift[],
  existingDaysOff: DayOff[],
  newShifts: Shift[],
  newDaysOff: DayOff[],
  range: { from: string; to: string } | null,
): { shifts: Shift[]; daysOff: DayOff[]; added: Shift[]; removed: Shift[] } {
  const same = (a: Shift, b: Shift) => a.date === b.date && a.start === b.start && a.end === b.end;
  const added = newShifts.filter((n) => !existingShifts.some((e) => same(e, n)));
  const offDates = new Set(newDaysOff.map((d) => d.date));

  if (!range) {
    return {
      shifts: [...existingShifts, ...added],
      daysOff: [...existingDaysOff.filter((d) => !offDates.has(d.date)), ...newDaysOff],
      added,
      removed: [],
    };
  }

  const inRange = (date: string) => date >= range.from && date <= range.to;
  const removed = existingShifts.filter((e) => inRange(e.date) && !newShifts.some((n) => same(e, n)));
  return {
    shifts: [...existingShifts.filter((e) => !removed.includes(e)), ...added],
    daysOff: [...existingDaysOff.filter((d) => !inRange(d.date) && !offDates.has(d.date)), ...newDaysOff],
    added,
    removed,
  };
}
