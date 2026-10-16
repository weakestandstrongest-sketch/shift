import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ExtractionError, ExtractionSchema, type Extraction, type ProviderRequest } from "../extract";
import { DEFAULT_MODEL } from "../storage";

export async function extractWithClaude({ images, system, userText, apiKey, model }: ProviderRequest): Promise<Extraction> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((img) => ({
    type: "image",
    source: { type: "base64", media_type: img.mediaType, data: img.data },
  }));
  content.push({ type: "text", text: userText });

  try {
    const stream = client.beta.messages.stream({
      model: model || DEFAULT_MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
      system,
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
