import { useId, useState } from "react";
import type { Store } from "../App";
import type { CalEvent } from "../types";
import { parseISODate } from "../lib/date";
import { newId } from "../lib/shift";
import { EVENT_COLORS } from "../lib/storage";
import { Icon } from "./Icon";
import { KindSwitch } from "./KindSwitch";
import { Switch } from "./Switch";

interface Props {
  store: Store;
  event: CalEvent | null;
  date: string;
  onClose: () => void;
  onSaved: (date: string, message: string) => void;
  onDelete: (e: CalEvent) => void;
  /** 新規のとき「シフト」に切り替える */
  onSwitchToShift: (date: string) => void;
}

/** ふつうの予定の追加・編集シート (タイトルだけでも登録できる) */
export function EventSheet({ store, event, date, onClose, onSaved, onDelete, onSwitchToShift }: Props) {
  const [draft, setDraft] = useState<CalEvent>(
    event ?? { id: newId(), date, title: "", start: null, end: null, color: EVENT_COLORS[0].color, note: "" },
  );
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const allDay = draft.start == null;
  const allDayId = useId();
  const valid = Boolean(draft.title.trim() && draft.date);

  const save = () => {
    store.upsertEvent({ ...draft, title: draft.title.trim(), end: allDay ? null : draft.end || null });
    const d = parseISODate(draft.date);
    onSaved(draft.date, event ? "予定を更新しました" : `${d.getMonth() + 1}/${d.getDate()} に予定を追加しました`);
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={event ? "予定を編集" : "予定を追加"} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          {event ? <h3>予定を編集</h3> : <KindSwitch value="event" onChange={() => onSwitchToShift(draft.date)} />}
          <button className="round-btn" aria-label="閉じる" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* iOS の設定画面のような、角丸のまとまりに分けて並べる */}
        <div className="ios-group">
          <input
            className="ios-field"
            aria-label="タイトル"
            value={draft.title}
            autoFocus={!event}
            placeholder="タイトル (例: 歯医者)"
            onChange={(e) => set("title", e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && valid && save()}
          />
          <input
            className="ios-field"
            aria-label="メモ"
            value={draft.note}
            placeholder="メモ (場所や持ち物など)"
            onChange={(e) => set("note", e.target.value)}
          />
        </div>

        <div className="ios-group">
          <label className="ios-row">
            <span>日付</span>
            <input className="ios-pill" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
          </label>
          <div className="ios-row">
            <span id={allDayId}>終日</span>
            <Switch
              labelledBy={allDayId}
              checked={allDay}
              onChange={(on) => setDraft((d) => (on ? { ...d, start: null, end: null } : { ...d, start: "10:00", end: "11:00" }))}
            />
          </div>
          {!allDay && (
            <>
              <label className="ios-row">
                <span>開始</span>
                <input className="ios-pill time" type="time" value={draft.start ?? ""} onChange={(e) => set("start", e.target.value || "00:00")} />
              </label>
              <label className="ios-row">
                <span>終了</span>
                <input className="ios-pill time" type="time" value={draft.end ?? ""} onChange={(e) => set("end", e.target.value || null)} />
              </label>
            </>
          )}
        </div>

        <div className="ios-group">
          <div className="ios-row">
            <span>色</span>
            <div className="color-pick" role="radiogroup" aria-label="色">
              {EVENT_COLORS.map(({ color, name }) => (
                <button
                  key={color}
                  role="radio"
                  aria-checked={draft.color === color}
                  aria-label={name}
                  className={draft.color === color ? "on" : ""}
                  style={{ background: color }}
                  onClick={() => set("color", color)}
                />
              ))}
            </div>
          </div>
        </div>

        <button className="primary wide" disabled={!valid} onClick={save}>
          {event ? "保存" : "追加する"}
        </button>
        {event && (
          <button className="danger wide" onClick={() => onDelete(event)}>
            この予定を削除
          </button>
        )}
      </div>
    </div>
  );
}
