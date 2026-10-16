import { useState } from "react";
import type { Store } from "../App";
import type { Shift } from "../types";
import { OFF_TYPES } from "../types";
import { parseISODate } from "../lib/date";
import { formatHours, newId, ruleBreak, spanMinutes, workMinutes } from "../lib/shift";
import { Icon } from "./Icon";
import { KindSwitch } from "./KindSwitch";

interface Props {
  store: Store;
  shift: Shift | null;
  date: string;
  onClose: () => void;
  onSaved: (date: string, message: string) => void;
  onDelete: (s: Shift) => void;
  /** 新規のとき「予定」に切り替える */
  onSwitchToEvent: (date: string) => void;
}

interface Preset {
  label: string;
  start: string;
  end: string;
}

/** よく使う時間: 登録済みシフトで多い組み合わせ + シフト記号 */
function presets(store: Store): Preset[] {
  const count = new Map<string, number>();
  for (const s of store.data.shifts) {
    const k = `${s.start}-${s.end}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const fromShifts = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => {
      const [start, end] = k.split("-");
      return { label: `${start.replace(/^0/, "")}〜${end.replace(/^0/, "")}`, start, end };
    });
  const fromCodes = store.data.settings.codes
    .filter((c) => c.code && c.start && c.end)
    .map((c) => ({ label: `${c.code} ${c.start.replace(/^0/, "")}〜${c.end.replace(/^0/, "")}`, start: c.start, end: c.end }));
  const seen = new Set<string>();
  return [...fromCodes, ...fromShifts].filter((p) => {
    const k = `${p.start}-${p.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const md = (iso: string) => {
  const d = parseISODate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export function ShiftSheet({ store, shift, date, onClose, onSaved, onDelete, onSwitchToEvent }: Props) {
  const { data } = store;
  const list = presets(store);
  const [draft, setDraft] = useState<Shift>(
    shift ?? {
      id: newId(),
      date,
      start: list[0]?.start ?? "09:00",
      end: list[0]?.end ?? "17:00",
      workplaceId: data.settings.defaultWorkplaceId ?? data.workplaces[0]?.id ?? null,
      breakMinutes: null,
      note: "",
      source: "manual",
    },
  );
  const set = <K extends keyof Shift>(k: K, v: Shift[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const valid = Boolean(draft.date && draft.start && draft.end);
  const rules = data.settings.breakRules;
  const autoBreak = valid ? ruleBreak(spanMinutes(draft), rules) : 0;

  const save = () => {
    store.upsertShift(draft);
    // 勤務を入れた日の「休み」は取り消す
    if (data.daysOff.some((d) => d.date === draft.date)) store.setDayOff(draft.date, null);
    onSaved(draft.date, shift ? "シフトを更新しました" : `${md(draft.date)} にシフトを追加しました`);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={shift ? "シフトを編集" : "シフトを追加"} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          {shift ? <h3>シフトを編集</h3> : <KindSwitch value="shift" onChange={() => onSwitchToEvent(draft.date)} />}
          <button className="round-btn" aria-label="閉じる" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <label>
          日付
          <input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
        </label>

        {list.length > 0 && (
          <div className="presets" aria-label="よく使う時間">
            {list.map((p) => (
              <button
                key={p.label}
                className={`preset${draft.start === p.start && draft.end === p.end ? " on" : ""}`}
                onClick={() => setDraft((d) => ({ ...d, start: p.start, end: p.end }))}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="row2">
          <label>
            開始
            <input type="time" value={draft.start} onChange={(e) => set("start", e.target.value)} />
          </label>
          <label>
            終了
            <input type="time" value={draft.end} onChange={(e) => set("end", e.target.value)} />
          </label>
        </div>

        <div className="row2">
          <label>
            勤務先
            <select value={draft.workplaceId ?? ""} onChange={(e) => set("workplaceId", e.target.value || null)}>
              <option value="">未設定</option>
              {data.workplaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            休憩 (分)
            <input
              type="number"
              min={0}
              step={15}
              value={draft.breakMinutes ?? ""}
              placeholder={`自動 ${autoBreak}分`}
              onChange={(e) => set("breakMinutes", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>

        <label>
          メモ
          <input type="text" value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="例: レジ担当" />
        </label>

        {valid && (
          <p className="sheet-sum">
            実働 <b>{formatHours(workMinutes(draft, rules))}</b>（休憩 {draft.breakMinutes ?? autoBreak}分
            {draft.breakMinutes == null ? "・自動" : ""}）
          </p>
        )}

        <button className="primary wide" disabled={!valid} onClick={save}>
          {shift ? "保存" : "追加する"}
        </button>

        {shift ? (
          <button className="danger wide" onClick={() => onDelete(shift)}>
            このシフトを削除
          </button>
        ) : (
          <div className="off-quick">
            <span className="muted">この日を休みにする</span>
            <div>
              {OFF_TYPES.map((t) => (
                <button
                  key={t}
                  className={`off-tag off-${t}`}
                  onClick={() => {
                    store.setDayOff(draft.date, t);
                    onSaved(draft.date, `${md(draft.date)} を${t}にしました`);
                    onClose();
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
