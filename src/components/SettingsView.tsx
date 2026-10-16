import { useState } from "react";
import type { Store } from "../App";
import type { BreakRule, OffSymbol, Settings, ShiftCode, Workplace } from "../types";
import { OFF_TYPES } from "../types";
import { newId } from "../lib/shift";
import { DEFAULT_BREAK_RULES, DEFAULT_GEMINI_MODEL, DEFAULT_OFF_SYMBOLS, downloadFile, exportJSON, migrate, WORKPLACE_COLORS } from "../lib/storage";
import { todayISO } from "../lib/date";

export function SettingsView({ store }: { store: Store }) {
  const { data, setData } = store;
  const { settings } = data;
  const setSettings = (patch: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const [aliasText, setAliasText] = useState(settings.aliases.join("、"));
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setWorkplaces = (fn: (w: Workplace[]) => Workplace[]) => setData((d) => ({ ...d, workplaces: fn(d.workplaces) }));
  const setCodes = (fn: (c: ShiftCode[]) => ShiftCode[]) => setSettings({ codes: fn(settings.codes) });
  const setOff = (fn: (o: OffSymbol[]) => OffSymbol[]) => setSettings({ offSymbols: fn(settings.offSymbols) });
  const setRules = (fn: (r: BreakRule[]) => BreakRule[]) => setSettings({ breakRules: fn(settings.breakRules) });
  const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const fromHHMM = (s: string) => {
    const [h, m] = s.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  return (
    <div>
      <section className="card">
        <h3>あなたの名前</h3>
        <label>
          名前 (シフト表に書かれている名前)
          <input value={settings.myName} placeholder="例: 山田 花子" onChange={(e) => setSettings({ myName: e.target.value })} />
        </label>
        <label>
          別表記 (「、」区切り)
          <input
            value={aliasText}
            placeholder="例: 山田、ヤマダ、はなこ"
            onChange={(e) => setAliasText(e.target.value)}
            onBlur={() =>
              setSettings({
                aliases: aliasText
                  .split(/[、,，\n]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
          <small className="muted">シフト表で苗字だけ・あだ名で書かれている場合に入れてください</small>
        </label>
      </section>

      <section className="card">
        <h3>写真の読み取り (Gemini)</h3>
        <label>
          Gemini API キー
          <div className="inline">
            <input
              type={showKey ? "text" : "password"}
              value={settings.geminiApiKey}
              placeholder="AIza..."
              autoComplete="off"
              onChange={(e) => setSettings({ geminiApiKey: e.target.value.trim() })}
            />
            <button onClick={() => setShowKey((v) => !v)}>{showKey ? "隠す" : "表示"}</button>
          </div>
          <small className="muted">
            Google アカウントがあれば無料で発行できます (クレジットカード不要)。
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
              キーの発行はこちら
            </a>
          </small>
        </label>
        <p className="notice">
          ⚠️ 無料枠では、送った写真や結果が Google のサービス改善に使われることがあります。
          シフト表には同僚の名前も写るので、気になる場合は自分の行が分かる範囲だけを撮影してください。
          また、無料枠には 1 日あたりの利用回数の上限があります。
        </p>
        <details>
          <summary className="muted">詳細設定</summary>
          <label>
            モデル名
            <input
              value={settings.geminiModel}
              placeholder={DEFAULT_GEMINI_MODEL}
              onChange={(e) => setSettings({ geminiModel: e.target.value.trim() })}
            />
            <small className="muted">通常は変更不要です (空欄なら {DEFAULT_GEMINI_MODEL})</small>
          </label>
        </details>
        <p className="hint">API キーはこの端末の中だけに保存され、読み取りのときに Gemini API へ直接送られます。</p>
      </section>

      <section className="card">
        <h3>勤務先</h3>
        {data.workplaces.length === 0 && <p className="muted">勤務先を登録すると、色分けと給料計算ができます。</p>}
        {data.workplaces.map((w) => (
          <div key={w.id} className="wp-edit">
            <input
              type="color"
              value={w.color}
              aria-label="色"
              onChange={(e) => setWorkplaces((ws) => ws.map((x) => (x.id === w.id ? { ...x, color: e.target.value } : x)))}
            />
            <input
              value={w.name}
              aria-label="勤務先の名前"
              onChange={(e) => setWorkplaces((ws) => ws.map((x) => (x.id === w.id ? { ...x, name: e.target.value } : x)))}
            />
            <input
              type="number"
              min={0}
              placeholder="時給"
              aria-label="時給"
              value={w.hourlyWage ?? ""}
              onChange={(e) =>
                setWorkplaces((ws) => ws.map((x) => (x.id === w.id ? { ...x, hourlyWage: e.target.value === "" ? null : Number(e.target.value) } : x)))
              }
            />
            <span className="muted">円</span>
            <button
              className="icon-btn"
              aria-label="削除"
              onClick={() => {
                if (!confirm(`「${w.name}」を削除しますか? (登録済みのシフトは残ります)`)) return;
                setData((d) => ({
                  ...d,
                  workplaces: d.workplaces.filter((x) => x.id !== w.id),
                  settings: { ...d.settings, defaultWorkplaceId: d.settings.defaultWorkplaceId === w.id ? null : d.settings.defaultWorkplaceId },
                }));
              }}
            >
              🗑
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            setWorkplaces((ws) => [
              ...ws,
              { id: newId(), name: `勤務先${ws.length + 1}`, color: WORKPLACE_COLORS[ws.length % WORKPLACE_COLORS.length], hourlyWage: null },
            ])
          }
        >
          ＋ 勤務先を追加
        </button>
        {data.workplaces.length > 0 && (
          <label>
            いつもの勤務先 (取り込み・追加時の初期値)
            <select value={settings.defaultWorkplaceId ?? ""} onChange={(e) => setSettings({ defaultWorkplaceId: e.target.value || null })}>
              <option value="">未設定</option>
              {data.workplaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <section className="card">
        <h3>シフト記号</h3>
        <p className="muted">シフト表が「早」「遅」「A」のような記号の場合、時間を登録しておくと自動で変換します。</p>
        {settings.codes.map((c, i) => (
          <div key={i} className="code-edit">
            <input
              value={c.code}
              aria-label="記号"
              placeholder="早"
              onChange={(e) => setCodes((cs) => cs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
            />
            <input type="time" value={c.start} aria-label="開始" onChange={(e) => setCodes((cs) => cs.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
            〜
            <input type="time" value={c.end} aria-label="終了" onChange={(e) => setCodes((cs) => cs.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
            <button className="icon-btn" aria-label="削除" onClick={() => setCodes((cs) => cs.filter((_, j) => j !== i))}>
              🗑
            </button>
          </div>
        ))}
        <button onClick={() => setCodes((cs) => [...cs, { code: "", start: "09:00", end: "17:00" }])}>＋ 記号を追加</button>
      </section>

      <section className="card">
        <h3>休みの記号</h3>
        <p className="muted">シフト表でこの記号が書かれた日は、勤務ではなく休みとして登録します。「空欄」は何も書かれていないマス (色だけのマスも含む) です。</p>
        {settings.offSymbols.map((o, i) => (
          <div key={i} className="code-edit">
            <input
              value={o.symbol}
              aria-label="記号"
              placeholder="*"
              onChange={(e) => setOff((os) => os.map((x, j) => (j === i ? { ...x, symbol: e.target.value } : x)))}
            />
            <span>→</span>
            <select
              aria-label="休みの種類"
              value={o.type}
              onChange={(e) => setOff((os) => os.map((x, j) => (j === i ? { ...x, type: e.target.value as OffSymbol["type"] } : x)))}
            >
              {OFF_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value="無視">無視 (登録しない)</option>
            </select>
            <button className="icon-btn" aria-label="削除" onClick={() => setOff((os) => os.filter((_, j) => j !== i))}>
              🗑
            </button>
          </div>
        ))}
        <div className="photo-buttons">
          <button onClick={() => setOff((os) => [...os, { symbol: "", type: "公休" }])}>＋ 記号を追加</button>
          <button onClick={() => setSettings({ offSymbols: DEFAULT_OFF_SYMBOLS })}>初期設定に戻す</button>
        </div>
      </section>

      <section className="card">
        <h3>休憩ルール</h3>
        <p className="muted">
          拘束時間 (開始〜終了) が左の時間以上なら、右の分だけ休憩を自動で引いて実働時間と給料を計算します。シフトごとに手入力した休憩があればそちらを使います。
        </p>
        {[...settings.breakRules]
          .map((r, i) => ({ r, i }))
          .sort((a, b) => a.r.minMinutes - b.r.minMinutes)
          .map(({ r, i }) => (
            <div key={i} className="rule-edit">
              <input
                type="time"
                aria-label="拘束時間"
                value={toHHMM(r.minMinutes)}
                onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, minMinutes: fromHHMM(e.target.value) } : x)))}
              />
              <span>以上→休憩</span>
              <input
                type="number"
                min={0}
                step={15}
                aria-label="休憩 (分)"
                value={r.breakMinutes}
                onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, breakMinutes: Math.max(0, Number(e.target.value) || 0) } : x)))}
              />
              <span>分</span>
              <button className="icon-btn" aria-label="削除" onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}>
                🗑
              </button>
            </div>
          ))}
        {settings.breakRules.length === 0 && <p className="muted">ルールがないので、休憩は 0 分として計算します。</p>}
        <div className="photo-buttons">
          <button onClick={() => setRules((rs) => [...rs, { minMinutes: 6 * 60, breakMinutes: 45 }])}>＋ ルールを追加</button>
          <button onClick={() => setSettings({ breakRules: DEFAULT_BREAK_RULES })}>初期設定に戻す</button>
        </div>
      </section>

      <section className="card">
        <h3>シフト表の読み方メモ</h3>
        <p className="muted">
          記号や色の意味など、あなたのシフト表だけのルールを書いておくと、写真を読み取るときに AI に伝えます。
        </p>
        <textarea
          rows={5}
          value={settings.readingNotes}
          placeholder={"例:\n・右側の「週報」の列は担当者のメモなので無視する\n・「L」はラスト (閉店) まで"}
          onChange={(e) => setSettings({ readingNotes: e.target.value })}
        />
      </section>

      <section className="card">
        <h3>データ</h3>
        <p className="muted">データはこのブラウザの中に保存されています。機種変更の前にはバックアップしてください。</p>
        <div className="photo-buttons">
          <button onClick={() => downloadFile(`shift-backup-${todayISO()}.json`, exportJSON(data), "application/json")}>バックアップを保存</button>
          <label className="button">
            バックアップから復元
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  const restored = migrate(JSON.parse(await file.text()));
                  if (!confirm(`シフト ${restored.shifts.length}件 を復元します。今のデータは上書きされます。よろしいですか?`)) return;
                  // API キーはバックアップに含めないので、今のものを引き継ぐ
                  setData((d) => ({
                    ...restored,
                    settings: { ...restored.settings, geminiApiKey: d.settings.geminiApiKey },
                  }));
                  setAliasText(restored.settings.aliases.join("、"));
                  setMessage("復元しました");
                } catch {
                  setMessage("ファイルを読み込めませんでした");
                }
              }}
            />
          </label>
        </div>
        {message && <p className="muted">{message}</p>}
      </section>
    </div>
  );
}
