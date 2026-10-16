import { useState } from "react";
import { DEFAULT_DAILY_LIMIT, loadUsage, setDailyLimit, summarizeUsage } from "../lib/usage";

/** Gemini 無料枠の残り回数 (今日あと何回読み取れるか) */
export function UsageMeter({ editable = false }: { editable?: boolean }) {
  const [, refresh] = useState(0);
  const u = summarizeUsage();
  const [limitText, setLimitText] = useState(() => String(loadUsage().dailyLimit ?? ""));
  const used = Math.min(1, u.limit > 0 ? (u.limit - u.remaining) / u.limit : 1);
  const reset = `${u.resetAt.getHours()}:${String(u.resetAt.getMinutes()).padStart(2, "0")}`;

  return (
    <div className={`usage${u.remaining === 0 ? " empty" : ""}`}>
      <div className="usage-top">
        <span>
          今日あと <b>{u.remaining}</b> 回読み取れます
        </span>
        <small>{reset} にリセット</small>
      </div>
      <div className="usage-bar" role="progressbar" aria-valuemin={0} aria-valuemax={u.limit} aria-valuenow={u.limit - u.remaining}>
        <i style={{ width: `${used * 100}%` }} />
      </div>
      <small className="muted">
        今日 {u.today}回 / 1日 {u.limit}回まで・今月 {u.month}回
        {u.isEstimate ? "（上限は目安）" : u.limitFromGoogle ? "（上限は Google の通知より）" : ""}
      </small>
      {u.remaining === 0 && <p className="usage-note">今日の無料枠を使い切った可能性があります。{reset} を過ぎるとまた使えます。</p>}
      {editable && (
        <label className="usage-limit">
          1日の上限 (回)
          <input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder={`${DEFAULT_DAILY_LIMIT} (目安)`}
            value={limitText}
            onChange={(e) => setLimitText(e.target.value)}
            onBlur={() => {
              setDailyLimit(Number(limitText) || null);
              refresh((n) => n + 1);
            }}
          />
          <small className="muted">
            Google AI Studio の「使用量」で確認できる上限に合わせてください。上限に達したときは、Google の通知から自動で設定されます。
          </small>
        </label>
      )}
    </div>
  );
}
