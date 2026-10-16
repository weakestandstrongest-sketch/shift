import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Settings, Shift, ShiftCode } from "../types";
import { isValidISODate, normalizeTime, todayISO } from "./date";
import type { PreparedImage } from "./image";
import { isDuplicate, lookupCode, newId } from "./shift";

export const ExtractionSchema = z.object({
  /** シフト表の中で本人として扱った表記。見つからなければ null */
  matched_name: z.string().nullable(),
  /** 本人が見つからなかったときに、表に載っていた名前の一覧 */
  names_in_table: z.array(z.string()),
  shifts: z.array(
    z.object({
      date: z.string(),
      raw: z.string(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      note: z.string(),
      uncertain: z.boolean(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

const SYSTEM_PROMPT = `あなたは、アルバイトやパートのシフト表の写真から、指定された1人分の勤務予定を正確に読み取るアシスタントです。

読み取りのルール:
- シフト表の形式はさまざまです (名前が行・日付が列の月間表、日ごとの時間帯バー表、手書きの表、LINE のスクリーンショットなど)。まず表の構造を把握してから、指定された人の行・列・枠だけを読んでください。
- 名前は「本人の名前」と「別表記」のどれかに一致するものを探します。苗字だけ・名前だけ・カタカナ/ひらがな・敬称付き・一部が欠けた表記も同一人物として扱って構いません。似た名前の別人 (同じ苗字の人が複数いる等) がいる場合は、より一致度の高い方を選び、warnings に書いてください。
- 本人が見つからない場合は matched_name を null、shifts を空にし、names_in_table に表に載っている名前を書いてください。
- 出勤する日だけを shifts に入れます。休み (休・公・×・-・空欄・希望休・有給など) は入れません。
- date は YYYY-MM-DD。表に年が書かれていなければ、基準日に最も近くなる年を選んでください (例: 基準日が 2026年12月で表が1月なら 2027年)。
- raw にはそのマスに書かれている文字をそのまま入れます (例: "9-17", "早", "A", "17:00〜L")。
- start / end は 24 時間表記の HH:MM。日付をまたぐ場合は "25:00" のように 24 以上で書いて構いません。
- 「早」「遅」「A」のような記号だけのマスは、写真内の凡例か、ユーザーが登録した記号の対応表から時間を決めてください。どちらからも分からなければ start / end を null にします。
- 「L」「ラスト」「締め」「〜CL」など終了時刻が書かれていない場合は end を null にし、note に理由を書きます。
- 読みにくい・自信がないマスは uncertain を true にします。推測で埋めずに、分かったことだけを書いてください。
- 休憩時間・担当・ポジションなどの補足があれば note に短く書きます。`;

function buildUserText(settings: Settings, targetMonth: string | null): string {
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
  lines.push("", "添付したシフト表の写真から、本人の勤務予定をすべて書き出してください。");
  return lines.join("\n");
}

export class ExtractionError extends Error {}

/** 写真 (複数枚可) を Claude に送り、本人のシフトを読み取る */
export async function extractShifts(images: PreparedImage[], settings: Settings, targetMonth: string | null): Promise<Extraction> {
  if (!settings.apiKey) throw new ExtractionError("設定画面で Anthropic API キーを入力してください。");
  if (!settings.myName.trim()) throw new ExtractionError("設定画面で自分の名前を入力してください。");

  // 個人用アプリとして、API キーは利用者の端末内だけに保存しブラウザから直接呼び出す
  const client = new Anthropic({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });

  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.data },
  }));
  content.push({ type: "text", text: buildUserText(settings, targetMonth) });

  try {
    const stream = client.beta.messages.stream({
      model: settings.model || "claude-opus-5-5",
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new ExtractionError("この画像は読み取れませんでした。別の写真で試してください。");
    }
    if (message.stop_reason === "max_tokens") {
      throw new ExtractionError("読み取り結果が長すぎて途中で切れました。写真を分けて試してください。");
    }
    if (!message.parsed_output) {
      throw new ExtractionError("読み取り結果を解釈できませんでした。もう一度試してください。");
    }
    return message.parsed_output;
  } catch (e) {
    if (e instanceof ExtractionError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ExtractionError("API キーが正しくありません。設定を確認してください。");
    if (e instanceof Anthropic.PermissionDeniedError) throw new ExtractionError("この API キーではこのモデルを使えません。");
    if (e instanceof Anthropic.RateLimitError) throw new ExtractionError("混み合っています。少し待ってからもう一度試してください。");
    if (e instanceof Anthropic.BadRequestError) throw new ExtractionError(`リクエストエラー: ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new ExtractionError("通信できませんでした。ネットワークを確認してください。");
    if (e instanceof Anthropic.APIError) throw new ExtractionError(`API エラー (${e.status}): ${e.message}`);
    throw e;
  }
}

/** 取り込み画面で確認・修正するための候補 */
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
}

export function toCandidates(result: Extraction, codes: ShiftCode[], existing: Shift[]): Candidate[] {
  const out: Candidate[] = [];
  for (const s of result.shifts) {
    if (!isValidISODate(s.date)) continue;
    let start = normalizeTime(s.start);
    let end = normalizeTime(s.end);
    const code = lookupCode(s.raw, codes);
    if (code) {
      start ??= code.start;
      end ??= code.end;
    }
    const needsTime = !start || !end;
    const c = { date: s.date, start: start ?? "", end: end ?? "" };
    const duplicate = !needsTime && isDuplicate(c, existing);
    out.push({
      key: newId(),
      ...c,
      raw: s.raw,
      note: s.note,
      uncertain: s.uncertain,
      needsTime,
      duplicate,
      selected: !needsTime && !duplicate,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}
