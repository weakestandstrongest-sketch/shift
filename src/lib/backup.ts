import type { AppData, Settings } from "../types";
import { addDays, parseISODate, todayISO } from "./date";
import { downloadFile, exportJSON } from "./storage";

/** お知らせの間隔の選択肢 */
export const BACKUP_INTERVALS = [
  { days: 0, label: "しない" },
  { days: 7, label: "1週間ごと" },
  { days: 14, label: "2週間ごと" },
  { days: 30, label: "1か月ごと" },
];

/** 「あとで」を押したら何日あとにもう一度出すか */
export const SNOOZE_DAYS = 3;

const daysBetween = (a: string, b: string) => Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / 86400000);

/**
 * バックアップのお知らせを出すかどうか。
 * 出すときは、前回のバックアップ (なければ数え始めた日) から何日たったかを返す。出さないときは null。
 */
export function backupDue(data: AppData, today = todayISO()): { days: number; never: boolean } | null {
  const s = data.settings;
  if (!s.backupReminderDays) return null;
  // 守るデータがまだないときは出さない
  if (data.shifts.length + data.events.length + data.daysOff.length === 0) return null;
  if (s.backupSnoozedUntil && today < s.backupSnoozedUntil) return null;
  const from = s.lastBackupAt ?? s.backupReminderSince;
  const days = daysBetween(from, today);
  return days >= s.backupReminderDays ? { days, never: !s.lastBackupAt } : null;
}

/** バックアップのファイルを保存して、保存した日を記録する */
export function saveBackup(data: AppData, setSettings: (patch: Partial<Settings>) => void): void {
  const today = todayISO();
  downloadFile(`shift-backup-${today}.json`, exportJSON(data), "application/json");
  setSettings({ lastBackupAt: today, backupSnoozedUntil: null });
}

/** 「あとで」: 数日だけお知らせを止める */
export function snoozeBackup(setSettings: (patch: Partial<Settings>) => void): void {
  setSettings({ backupSnoozedUntil: addDays(todayISO(), SNOOZE_DAYS) });
}
