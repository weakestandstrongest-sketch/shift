import { useState } from "react";
import type { Store } from "../App";
import type { Shift } from "../types";
import { formatHours, newId, ruleBreak, spanMinutes, workMinutes } from "../lib/shift";

export function ShiftEditor({ store, shift, date, onClose }: { store: Store; shift: Shift | null; date: string; onClose: () => void }) {
  const { data } = store;
  const [draft, setDraft] = useState<Shift>(
    shift ?? {
      id: newId(),
      date,
      start: "09:00",
      end: "17:00",
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label="シフトの編集" onClick={(e) => e.stopPropagation()}>
        <h3>{shift ? "シフトを編集" : "シフトを追加"}</h3>
        <label>
          日付
          <input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
        </label>
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
            休憩 (分・空欄で自動)
            <input
              type="number"
              min={0}
              step={15}
              value={draft.breakMinutes ?? ""}
              placeholder={`自動 (${autoBreak}分)`}
              onChange={(e) => set("breakMinutes", e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            />
          </label>
        </div>
        <label>
          メモ
          <input type="text" value={draft.note} onChange={(e) => set("note", e.target.value)} placeholder="例: レジ担当" />
        </label>
        {valid && (
          <p className="muted">
            実働 {formatHours(workMinutes(draft, rules))} (休憩 {draft.breakMinutes ?? autoBreak}分
            {draft.breakMinutes == null ? "・ルールから自動" : ""})
          </p>
        )}
        <div className="modal-actions">
          {shift && (
            <button
              className="danger"
              onClick={() => {
                store.deleteShift(shift.id);
                onClose();
              }}
            >
              削除
            </button>
          )}
          <span className="spacer" />
          <button onClick={onClose}>キャンセル</button>
          <button
            className="primary"
            disabled={!valid}
            onClick={() => {
              store.upsertShift(draft);
              onClose();
            }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
