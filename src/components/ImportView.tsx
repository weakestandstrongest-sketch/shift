import { useRef, useState } from "react";
import type { Store } from "../App";
import type { Shift } from "../types";
import { formatDateJa, parseISODate } from "../lib/date";
import type { Candidate, Extraction } from "../lib/extract";
import { prepareImage, type PreparedImage } from "../lib/image";
import { isDuplicate, newId } from "../lib/shift";

export function ImportView({
  store,
  goSettings,
  onImported,
}: {
  store: Store;
  goSettings: () => void;
  onImported: (year: number, month: number) => void;
}) {
  const { data } = store;
  const { settings } = data;
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [targetMonth, setTargetMonth] = useState("");
  const [workplaceId, setWorkplaceId] = useState<string | null>(settings.defaultWorkplaceId ?? data.workplaces[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extraction | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  const hasKey = Boolean(settings.provider === "claude" ? settings.apiKey : settings.geminiApiKey);
  const ready = Boolean(settings.myName.trim() && hasKey);

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      const prepared = await Promise.all([...files].map(prepareImage));
      setImages((prev) => [...prev, ...prepared]);
      setResult(null);
      setCandidates([]);
    } catch {
      setError("画像を読み込めませんでした。JPEG か PNG の写真を選んでください。");
    }
  }

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    setCandidates([]);
    try {
      // AI の SDK は大きいので、読み取りを実行するときだけ読み込む
      const { extractShifts, toCandidates } = await import("../lib/extract");
      const r = await extractShifts(images, settings, targetMonth || null);
      setResult(r);
      setCandidates(toCandidates(r, settings.codes, data.shifts));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function updateCandidate(key: string, patch: Partial<Candidate>) {
    setCandidates((cs) =>
      cs.map((c) => {
        if (c.key !== key) return c;
        const next = { ...c, ...patch };
        if ("start" in patch || "end" in patch) {
          const needsTime = !next.start || !next.end;
          const duplicate = !needsTime && isDuplicate(next, data.shifts);
          // 時間を入力し終えたら自動でチェックを入れる
          next.selected = needsTime ? false : c.needsTime && !needsTime ? !duplicate : next.selected;
          next.needsTime = needsTime;
          next.duplicate = duplicate;
        }
        return next;
      }),
    );
  }

  function commit() {
    const chosen = candidates.filter((c) => c.selected && !c.needsTime);
    if (chosen.length === 0) return;
    const shifts: Shift[] = chosen.map((c) => ({
      id: newId(),
      date: c.date,
      start: c.start,
      end: c.end,
      workplaceId,
      breakMinutes: 0,
      note: c.note,
      source: "photo",
    }));
    store.addShifts(shifts);
    const first = parseISODate(chosen[0].date);
    setImages([]);
    setResult(null);
    setCandidates([]);
    onImported(first.getFullYear(), first.getMonth() + 1);
  }

  if (!ready) {
    return (
      <div className="card">
        <h2>写真からシフトを取り込む</h2>
        <p>シフト表の写真から、あなたの勤務日だけを自動で読み取ってカレンダーに登録します。</p>
        <p>はじめに設定画面で次の 2 つを入力してください。</p>
        <ul>
          <li className={settings.myName.trim() ? "done" : ""}>自分の名前 (シフト表に書かれている名前)</li>
          <li className={hasKey ? "done" : ""}>
            {settings.provider === "claude" ? "Anthropic API キー" : "Gemini API キー (無料で取得できます)"} — 写真の読み取りに使います
          </li>
        </ul>
        <button className="primary" onClick={goSettings}>
          設定を開く
        </button>
      </div>
    );
  }

  const selectedCount = candidates.filter((c) => c.selected && !c.needsTime).length;

  return (
    <div>
      <div className="card">
        <h2>写真からシフトを取り込む</h2>
        <p className="muted">
          「<strong>{[settings.myName, ...settings.aliases].join(" / ")}</strong>」のシフトを探します
        </p>

        <div className="photo-buttons">
          <button className="primary" onClick={() => cameraRef.current?.click()}>
            📷 撮影する
          </button>
          <button onClick={() => pickerRef.current?.click()}>🖼 写真を選ぶ</button>
        </div>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={pickerRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          data-testid="photo-input"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {images.length > 0 && (
          <>
            <div className="thumbs">
              {images.map((img, i) => (
                <div key={i} className="thumb">
                  <img src={img.previewUrl} alt={img.name} />
                  <button className="thumb-remove" aria-label="この写真を外す" onClick={() => setImages((p) => p.filter((_, j) => j !== i))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <p className="hint">表が複数枚に分かれている場合は、まとめて追加できます。</p>

            <div className="row2">
              <label>
                何月のシフト表?
                <input type="month" value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} />
                <small className="muted">空欄なら写真から自動判定</small>
              </label>
              <label>
                勤務先
                <select value={workplaceId ?? ""} onChange={(e) => setWorkplaceId(e.target.value || null)}>
                  <option value="">未設定</option>
                  {data.workplaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button className="primary wide" disabled={loading} onClick={run}>
              {loading ? "読み取り中…" : "シフトを読み取る"}
            </button>
            {loading && (
              <p className="muted center">
                <span className="spinner" /> 写真を解析しています (30秒〜1分ほどかかります)
              </p>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      {result && (
        <div className="card">
          {result.matched_name ? (
            <p>
              シフト表の「<strong>{result.matched_name}</strong>」さんの勤務を <strong>{candidates.length}件</strong> 見つけました。
            </p>
          ) : (
            <div className="error">
              <p>シフト表の中に「{settings.myName}」さんが見つかりませんでした。</p>
              {result.names_in_table.length > 0 && (
                <p>
                  表に載っている名前: {result.names_in_table.join("、")}
                  <br />
                  表記が違う場合は、設定の「別表記」に追加してからもう一度読み取ってください。
                </p>
              )}
            </div>
          )}
          {result.warnings.length > 0 && (
            <ul className="warnings">
              {result.warnings.map((w, i) => (
                <li key={i}>⚠️ {w}</li>
              ))}
            </ul>
          )}

          {candidates.length > 0 && (
            <>
              <p className="hint">内容を確認して、違うところは直してから追加してください。</p>
              <ul className="candidates">
                {candidates.map((c) => (
                  <li key={c.key} className={c.selected ? "on" : ""}>
                    <input
                      type="checkbox"
                      aria-label={`${formatDateJa(c.date)}を追加する`}
                      checked={c.selected}
                      disabled={c.needsTime}
                      onChange={(e) => updateCandidate(c.key, { selected: e.target.checked })}
                    />
                    <div className="cand-body">
                      <div className="cand-top">
                        <strong>{formatDateJa(c.date)}</strong>
                        <span className="raw">表記: {c.raw || "—"}</span>
                      </div>
                      <div className="cand-times">
                        <input type="time" value={c.start} onChange={(e) => updateCandidate(c.key, { start: e.target.value })} />
                        〜
                        <input type="time" value={c.end} onChange={(e) => updateCandidate(c.key, { end: e.target.value })} />
                      </div>
                      <div className="badges">
                        {c.needsTime && <span className="badge warn">時間を入力してください</span>}
                        {c.uncertain && <span className="badge warn">読み取りに自信なし</span>}
                        {c.duplicate && <span className="badge">登録済み</span>}
                        {c.note && <span className="badge note">{c.note}</span>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="primary wide" disabled={selectedCount === 0} onClick={commit}>
                {selectedCount}件をカレンダーに追加
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
