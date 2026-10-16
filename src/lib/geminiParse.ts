import { z } from "zod";
import { DAY_KINDS, type DayKind, type Extraction } from "./extract";

// モデルの出力は多少ゆれる前提で、足りない項目は既定値で補う
const LooseSchema = z.object({
  matched_name: z.string().nullish(),
  names_in_table: z.array(z.string()).nullish(),
  days: z
    .array(
      z.object({
        date: z.string(),
        raw: z.string().nullish(),
        kind: z.string().nullish(),
        color: z.string().nullish(),
        start: z.string().nullish(),
        end: z.string().nullish(),
        note: z.string().nullish(),
        uncertain: z.boolean().nullish(),
      }),
    )
    .nullish(),
  warnings: z.array(z.string()).nullish(),
});

/** Gemini の JSON 出力を共通の Extraction 形式に変換する。空文字は「不明」として null に戻す */
export function parseGeminiJSON(text: string): Extraction | null {
  let json: unknown;
  try {
    // ```json ... ``` で囲まれて返ってきた場合にも対応
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
  const r = LooseSchema.safeParse(json);
  if (!r.success) return null;
  const d = r.data;
  return {
    matched_name: d.matched_name?.trim() || null,
    names_in_table: d.names_in_table ?? [],
    days: (d.days ?? []).map((s) => ({
      date: s.date.trim(),
      raw: s.raw ?? "",
      kind: DAY_KINDS.includes(s.kind?.trim() as DayKind) ? (s.kind!.trim() as DayKind) : "不明",
      color: s.color?.trim() ?? "",
      start: s.start?.trim() || null,
      end: s.end?.trim() || null,
      note: s.note ?? "",
      uncertain: s.uncertain ?? false,
    })),
    warnings: d.warnings ?? [],
  };
}
