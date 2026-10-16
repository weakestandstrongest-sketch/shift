import { useState } from "react";
import type { Store } from "../App";
import type { Settings, ShiftCode, Workplace } from "../types";
import { newId } from "../lib/shift";
import { DEFAULT_MODEL, downloadFile, exportJSON, migrate, WORKPLACE_COLORS } from "../lib/storage";
import { todayISO } from "../lib/date";

const MODELS = [
  { id: DEFAULT_MODEL, label: "Claude Opus 5.5 (おすすめ・高精度)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (安め)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (最安・簡単な表向け)" },
];

export function SettingsView({ store }: { store: Store }) {
  const { data, setData } = store;
  const { settings } = data;
  const setSettings = (patch: Partial<Settings>) => setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const [aliasText, setAliasText] = useState(settings.aliases.join("、"));
  const [showKey, setShowKey] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const setWorkplaces = (fn: (w: Workplace[]) => Workplace[]) => setData((d) => ({ ...d, workplaces: fn(d.workplaces) }));
  const setCodes = (fn: (c: ShiftCode[]) => ShiftCode[]) => setSettings({ codes: fn(settings.codes) });

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
        <h3>写真の読み取り (Claude)</h3>
        <label>
          Anthropic API キー
          <div className="inline">
            <input
              type={showKey ? "text" : "password"}
              value={settings.apiKey}
              placeholder="sk-ant-..."
              autoComplete="off"
              onChange={(e) => setSettings({ apiKey: e.target.value.trim() })}
            />
            <button onClick={() => setShowKey((v) => !v)}>{showKey ? "隠す" : "表示"}</button>
          </div>
          <small className="muted">
            キーは この端末の中だけ に保存され、写真の読み取り時に Anthropic へ直接送られます。
            <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
              キーの発行はこちら
            </a>
          </small>
        </label>
        <label>
          モデル
          <select value={settings.model} onChange={(e) => setSettings({ model: e.target.value })}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
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
                  setData((d) => ({ ...restored, settings: { ...restored.settings, apiKey: d.settings.apiKey } }));
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
