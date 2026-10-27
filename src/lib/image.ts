export interface PreparedImage {
  /** base64 (data: プレフィックスなし) */
  data: string;
  mediaType: "image/jpeg";
  previewUrl: string;
  name: string;
}

// 細かい表の文字を読めるよう大きめに保ちつつ、送信サイズ (= 送る時間) は抑える
const MAX_EDGE = 2048;

/** 写真を縮小・JPEG 化して API に送れる形にする (EXIF の向きも反映される) */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を処理できませんでした");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return {
    data: dataUrl.slice(dataUrl.indexOf(",") + 1),
    mediaType: "image/jpeg",
    previewUrl: dataUrl,
    name: file.name,
  };
}
