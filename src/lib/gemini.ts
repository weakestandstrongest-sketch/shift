import { ApiError, createPartFromBase64, createUserContent, FinishReason, GoogleGenAI } from "@google/genai";
import { ExtractionError, type Extraction, type GeminiRequest } from "./extract";
import { DEFAULT_GEMINI_MODEL } from "./storage";
import { parseGeminiJSON } from "./geminiParse";

// Gemini が対応する JSON Schema の範囲に収まるよう、null や anyOf を使わない形にする
// (分からない値は空文字 "" で返してもらい、parseGeminiJSON で null に戻す)
const shiftSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "YYYY-MM-DD" },
    raw: { type: "string" },
    start: { type: "string", description: "HH:MM。不明なら空文字" },
    end: { type: "string", description: "HH:MM。不明なら空文字" },
    note: { type: "string" },
    uncertain: { type: "boolean" },
  },
  required: ["date", "raw", "start", "end", "note", "uncertain"],
};

const responseSchema = {
  type: "object",
  properties: {
    matched_name: { type: "string", description: "本人として扱った表記。見つからなければ空文字" },
    names_in_table: { type: "array", items: { type: "string" } },
    shifts: { type: "array", items: shiftSchema },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["matched_name", "names_in_table", "shifts", "warnings"],
};

const GEMINI_NOTE = "\n\n※ 回答では null の代わりに空文字 \"\" を使ってください (matched_name / start / end)。";

const BLOCKED: string[] = [FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII, FinishReason.RECITATION];

export async function extractWithGemini({ images, system, userText, apiKey, model }: GeminiRequest): Promise<Extraction> {
  const ai = new GoogleGenAI({ apiKey });
  try {
    const res = await ai.models.generateContent({
      model: model || DEFAULT_GEMINI_MODEL,
      contents: [createUserContent([...images.map((img) => createPartFromBase64(img.data, img.mediaType)), userText + GEMINI_NOTE])],
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseJsonSchema: responseSchema,
      },
    });

    const finish = res.candidates?.[0]?.finishReason;
    if (res.promptFeedback?.blockReason || (finish && BLOCKED.includes(finish))) {
      throw new ExtractionError("この画像は読み取れませんでした。別の写真で試してください。");
    }
    if (finish === FinishReason.MAX_TOKENS) {
      throw new ExtractionError("読み取り結果が長すぎて途中で切れました。写真を分けて試してください。");
    }
    const parsed = parseGeminiJSON(res.text ?? "");
    if (!parsed) throw new ExtractionError("読み取り結果を解釈できませんでした。もう一度試してください。");
    return parsed;
  } catch (e) {
    if (e instanceof ExtractionError) throw e;
    if (e instanceof ApiError) {
      if (e.status === 429) {
        throw new ExtractionError("無料枠の利用回数の上限に達しました。しばらく (日をまたぐ場合もあります) 待ってから試してください。");
      }
      if (e.status === 400 && /API key|API_KEY/i.test(e.message)) {
        throw new ExtractionError("Gemini API キーが正しくありません。設定を確認してください。");
      }
      if (e.status === 401 || e.status === 403) throw new ExtractionError("この Gemini API キーでは使えません。設定を確認してください。");
      if (e.status === 404) throw new ExtractionError(`モデル「${model}」が見つかりません。設定のモデル名を確認してください。`);
      if (e.status >= 500) throw new ExtractionError("Gemini が混み合っています。少し待ってからもう一度試してください。");
      throw new ExtractionError(`Gemini API エラー (${e.status}): ${e.message}`);
    }
    if (e instanceof TypeError) throw new ExtractionError("通信できませんでした。ネットワークを確認してください。");
    throw e;
  }
}
