import type { Store } from "../App";
import { backupDue, saveBackup, snoozeBackup } from "../lib/backup";
import type { Settings } from "../types";
import { Icon } from "./Icon";

/** 定期的にバックアップをすすめるお知らせ (カレンダーの上に出す) */
export function BackupBanner({ store, onSaved }: { store: Store; onSaved: () => void }) {
  const due = backupDue(store.data);
  if (!due) return null;
  const setSettings = (patch: Partial<Settings>) => store.setData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  return (
    <div className="backup-banner" role="status">
      <span className="backup-icon">
        <Icon name="download" size={20} strokeWidth={2} />
      </span>
      <div className="backup-body">
        <strong>バックアップしませんか？</strong>
        <small>{due.never ? "まだ一度もバックアップしていません" : `前回のバックアップから${due.days}日たちました`}</small>
      </div>
      <div className="backup-actions">
        <button
          className="primary"
          onClick={() => {
            saveBackup(store.data, setSettings);
            onSaved();
          }}
        >
          バックアップする
        </button>
        <button onClick={() => snoozeBackup(setSettings)}>あとで</button>
      </div>
    </div>
  );
}
