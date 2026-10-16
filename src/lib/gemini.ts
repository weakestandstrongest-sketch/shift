import { ApiError, createPartFromBase64, createUserContent, FinishReason, GoogleGenAI } from "@google/genai";
import { DAY_KINDS, ExtractionError, type Extraction, type GeminiRequest } from "./extract";
import { DEFAULT_GEMINI_MODEL } from "./storage";
import { parseGeminiJSON } from "./geminiParse";
import { nextReset, recordQuotaError, recordRequest } from "./usage";

// Gemini が対応する JSON Schema の範囲に収まるよう、null や anyOf を使わない形にする
// (分からない値は空文字 "" で返してもらい、parseGeminiJSON で null に戻す)
const daySchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "YYYY-MM-DD" },
    raw: { type: "string", description: "マスの文字そのまま。何も書かれていなければ空文字" },
    kind: { type: "string", enum: DAY_KINDS },
    color: { type: "string", enum: ["白", "緑", "水色", "黄", "赤", "オレンジ", "グレー", "その他"], description: "マスの背景色" },
    start: { type: "string", description: "HH:MM。不明なら空文字" },
    end: { type: "string", description: "HH:MM。不明なら空文字" },
    note: { type: "string" },
    uncertain: { type: "boolean" },
  },
  required: ["date", "raw", "kind", "color", "start", "end", "note", "uncertain"],
};

const responseSchema = {
  type: "object",
  properties: {
    matched_name: { type: "string", description: "本人として扱った表記。見つからなければ空文字" },
    names_in_table: { type: "array", items: { type: "string" } },
    days: { type: "array", items: daySchema },
    warnings: { type: "array", items: { type: "string" } },
  },
  required: ["matched_name", "names_in_table", "days", "warnings"],
};

const GEMINI_NOTE = "\n\n※ 回答では null の代わりに空文字 \"\" を使ってください (matched_name / start / end)。";

const BLOCKED: string[] = [FinishReason.SAFETY, FinishReason.PROHIBITED_CONTENT, FinishReason.BLOCKLIST, FinishReason.SPII, FinishReason.RECITATION];

// 無料枠は一時的な混雑 (503 など) がよく起きるので、少し待って自動で再試行する
const RETRY = { attempts: 3, initialDelay: 2, maxDelay: 10, httpStatusCodes: [500, 502, 503, 504] };
// 既定モデルが混雑し続けるときに一度だけ試す軽量モデル
const FALLBACK_MODEL = "gemini-flash-lite-latest";

/** Google から返ったエラー文の要点 (原因を調べるときのため画面にも出す) */
function detail(e: ApiError): string {
  let msg = e.message;
  try {
    // メッセージに JSON が含まれる場合は error.message だけを取り出す
    const json = JSON.parse(msg.slice(msg.indexOf("{")));
    msg = json?.error?.message ?? msg;
  } catch {
    // そのまま使う
  }
  return `(${e.status}: ${msg.slice(0, 160)})`;
}

export async function extractWithGemini(req: GeminiRequest): Promise<Extraction> {
  const model = req.model || DEFAULT_GEMINI_MODEL;
  try {
    return await callGemini(req, model);
  } catch (e) {
    // 既定モデルが混雑で使えないときだけ、軽量モデルで読み直す
    if (e instanceof ApiError && e.status >= 500 && model === DEFAULT_GEMINI_MODEL) {
      try {
        const r = await callGemini(req, FALLBACK_MODEL);
        return { ...r, warnings: ["Gemini が混雑していたため、軽量モデルで読み取りました。いつもより念入りに確認してください。", ...r.warnings] };
      } catch {
        // 軽量モデルも失敗したら、元のエラーを伝える
      }
    }
    throw toExtractionError(e, model);
  }
}

async function callGemini({ images, system, userText, apiKey }: GeminiRequest, model: string): Promise<Extraction> {
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      retryOptions: RETRY,
      // 無料枠の残り回数を出すため、自動の再試行も含めて送ったリクエストを数える
      fetch: (input, init) => {
        recordRequest();
        return fetch(input, init);
      },
    },
  });
  const res = await ai.models.generateContent({
    model,
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
}

function toExtractionError(e: unknown, model: string): unknown {
  if (e instanceof ExtractionError) return e;
  if (e instanceof ApiError) {
    const d = detail(e);
    if (e.status === 429) {
      recordQuotaError(e.message);
      if (/per\s*minute|PerMinute/i.test(e.message)) {
        return new ExtractionError(`短い時間に読み取りすぎました。1 分ほど待ってからもう一度試してください。${d}`);
      }
      const reset = nextReset(Date.now());
      return new ExtractionError(
        `今日の無料枠を使い切りました。${reset.getHours()}:${String(reset.getMinutes()).padStart(2, "0")} を過ぎるとまた読み取れます。${d}`,
      );
    }
    if (e.status === 400 && /API key|API_KEY/i.test(e.message)) {
      return new ExtractionError("Gemini API キーが正しくありません。設定を確認してください。");
    }
    if (e.status === 401 || e.status === 403) return new ExtractionError(`この Gemini API キーでは使えません。設定を確認してください。${d}`);
    if (e.status === 404) return new ExtractionError(`モデル「${model}」が見つかりません。設定のモデル名を確認してください。${d}`);
    if (e.status >= 500) {
      return new ExtractionError(`Gemini が混み合っています (3 回試しましたが失敗しました)。数分おいてからもう一度試してください。${d}`);
    }
    return new ExtractionError(`Gemini API エラー ${d}`);
  }
  if (e instanceof TypeError) return new ExtractionError("通信できませんでした。ネットワークを確認してください。");
  return e;
}
