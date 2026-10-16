import { useId, useState } from "react";
import type { Store } from "../App";
import type { CalEvent } from "../types";
import { addMonths, parseISODate, toISODate, WEEKDAYS } from "../lib/date";
import { editOccurrence, makeRepeat, normalizeRepeat, repeatKey, repeatOptions, type RepeatKey, type Scope } from "../lib/repeat";
import { newId } from "../lib/shift";
import { EVENT_COLORS } from "../lib/storage";
import { ActionSheet } from "./ActionSheet";
import { Icon } from "./Icon";
import { KindSwitch } from "./KindSwitch";
import { Switch } from "./Switch";

interface Props {
  store: Store;
  /** 編集する予定。繰り返しの予定なら、その 1 回分 (date はその日) */
  event: CalEvent | null;
  date: string;
  onClose: () => void;
  onSaved: (date: string, message: string) => void;
  onDelete: (e: CalEvent) => void;
  /** 新規のとき「シフト」に切り替える */
  onSwitchToShift: (date: string) => void;
}

/** 1 か月後の日付 (繰り返しの終わりの初期値) */
function monthLater(iso: string): string {
  const d = parseISODate(iso);
  const { year, month } = addMonths(d.getFullYear(), d.getMonth() + 1, 1);
  const last = new Date(year, month, 0).getDate();
  return toISODate(new Date(year, month - 1, Math.min(d.getDate(), last)));
}

/** ふつうの予定の追加・編集シート (タイトルだけでも登録できる) */
export function EventSheet({ store, event, date, onClose, onSaved, onDelete, onSwitchToShift }: Props) {
  // 繰り返しの予定のときは、元の予定 (繰り返し全体) も見る
  const series = event ? store.data.events.find((e) => e.id === event.id) : undefined;
  const [draft, setDraft] = useState<CalEvent>(
    event ?? { id: newId(), date, title: "", start: null, end: null, color: EVENT_COLORS[0].color, note: "", repeat: null, until: null, exdates: [] },
  );
  const set = <K extends keyof CalEvent>(k: K, v: CalEvent[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const allDay = draft.start == null;
  const allDayId = useId();
  const valid = Boolean(draft.title.trim() && draft.date);
  const key = repeatKey(draft.repeat);
  const [askScope, setAskScope] = useState(false);

  /** 保存する形に整える */
  const finalEvent = (): CalEvent => {
    const repeat = normalizeRepeat(draft.repeat, draft.date);
    const until = repeat && draft.until ? (draft.until < draft.date ? draft.date : draft.until) : null;
    return { ...draft, title: draft.title.trim(), end: allDay ? null : draft.end || null, repeat, until, exdates: repeat ? (draft.exdates ?? []) : [] };
  };

  const done = (message: string) => {
    onSaved(draft.date, message);
    onClose();
  };

  const save = () => {
    const ev = finalEvent();
    if (event && series?.repeat) {
      // 繰り返しの予定: 繰り返し方を変えたときは「これ以降」に。それ以外はどこまで変えるか聞く
      const shape = (r: CalEvent["repeat"]) => JSON.stringify([repeatKey(r), r?.freq === "weekly" ? r.days : null]);
      const sameRepeat = shape(series.repeat) === shape(ev.repeat) && (series.until ?? null) === ev.until;
      if (sameRepeat) return setAskScope(true);
      return saveScope("future");
    }
    store.upsertEvent(ev);
    const d = parseISODate(draft.date);
    done(event ? "予定を更新しました" : `${d.getMonth() + 1}/${d.getDate()} に予定を追加しました`);
  };

  const saveScope = (scope: Scope) => {
    if (!event || !series) return;
    const ev = finalEvent();
    store.setData((d) => ({ ...d, events: editOccurrence(d.events, series.id, event.date, ev, scope, newId) }));
    done(scope === "this" ? "この日の予定だけ変更しました" : "これ以降の予定を変更しました");
  };

  const setRepeat = (k: RepeatKey) =>
    setDraft((d) => ({ ...d, repeat: makeRepeat(k, d.date, d.repeat?.freq === "weekly" ? d.repeat.days : undefined) }));
  const toggleDay = (w: number) =>
    setDraft((d) => {
      if (d.repeat?.freq !== "weekly") return d;
      const has = d.repeat.days.includes(w);
      // 最後の 1 つは外せない
      if (has && d.repeat.days.length === 1) return d;
      const days = has ? d.repeat.days.filter((x) => x !== w) : [...d.repeat.days, w].sort((a, b) => a - b);
      return { ...d, repeat: { freq: "weekly", days } };
    });
  const setDate = (iso: string) => setDraft((d) => ({ ...d, date: iso, repeat: iso ? normalizeRepeat(d.repeat, iso) : d.repeat }));

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
            <input className="ios-pill" type="date" value={draft.date} onChange={(e) => setDate(e.target.value)} />
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
          <label className="ios-row">
            <span>繰り返し</span>
            <select className="ios-pill" value={key} onChange={(e) => setRepeat(e.target.value as RepeatKey)}>
              {repeatOptions(draft.date || date).map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {draft.repeat?.freq === "weekly" && (
            <div className="weekday-pick" role="group" aria-label="繰り返す曜日">
              {WEEKDAYS.map((w, i) => {
                const on = draft.repeat?.freq === "weekly" && draft.repeat.days.includes(i);
                return (
                  <button key={w} type="button" aria-pressed={on} aria-label={`${w}曜日`} className={on ? "on" : ""} onClick={() => toggleDay(i)}>
                    {w}
                  </button>
                );
              })}
            </div>
          )}
          {draft.repeat && (
            <label className="ios-row">
              <span>繰り返しの終わり</span>
              <select
                className="ios-pill"
                value={draft.until ? "date" : "never"}
                onChange={(e) => set("until", e.target.value === "date" ? monthLater(draft.date) : null)}
              >
                <option value="never">なし</option>
                <option value="date">日付を指定</option>
              </select>
            </label>
          )}
          {draft.repeat && draft.until && (
            <label className="ios-row">
              <span>終わりの日</span>
              <input className="ios-pill" type="date" min={draft.date} value={draft.until} onChange={(e) => set("until", e.target.value || null)} />
            </label>
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
        {askScope && (
          <ActionSheet
            title="これは繰り返しの予定です"
            actions={[
              { label: "この日の予定だけ保存", onClick: () => saveScope("this") },
              { label: "これ以降の予定すべてに保存", onClick: () => saveScope("future") },
            ]}
            onCancel={() => setAskScope(false)}
          />
        )}
      </div>
    </div>
  );
}
