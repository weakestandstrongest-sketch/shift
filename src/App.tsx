import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AppData, CalEvent, DayOff, OffType, Shift } from "./types";
import { loadData, saveData } from "./lib/storage";
import { newId } from "./lib/shift";
import { parseISODate, todayISO } from "./lib/date";
import { HomeView } from "./components/HomeView";
import { ImportView } from "./components/ImportView";
import { ListView } from "./components/ListView";
import { SettingsView } from "./components/SettingsView";
import { ShiftSheet } from "./components/ShiftSheet";
import { EventSheet } from "./components/EventSheet";
import { Icon, type IconName } from "./components/Icon";
import { Splash } from "./components/Splash";

type Tab = "calendar" | "import" | "list" | "settings";

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "calendar", label: "カレンダー", icon: "calendar" },
  { id: "import", label: "写真で取込", icon: "camera" },
  { id: "list", label: "一覧", icon: "list" },
  { id: "settings", label: "設定", icon: "gear" },
];

export interface Store {
  data: AppData;
  setData: (fn: (d: AppData) => AppData) => void;
  upsertShift: (s: Shift) => void;
  deleteShift: (id: string) => void;
  upsertEvent: (e: CalEvent) => void;
  deleteEvent: (id: string) => void;
  addShifts: (s: Shift[]) => void;
  /** 休みを登録する。同じ日の休みは置き換える */
  addDaysOff: (d: DayOff[]) => void;
  /** その日の休みを設定する (null で取り消し) */
  setDayOff: (date: string, type: OffType | null) => void;
}

/** 追加・編集シートの状態 */
export type SheetState =
  | { kind: "shift"; shift: Shift | null; date: string }
  | { kind: "event"; event: CalEvent | null; date: string }
  | null;

/** 画面下に一時的に出すお知らせ (元に戻すボタン付き) */
export interface Toast {
  message: string;
  undo?: () => void;
}

export default function App() {
  const [data, setDataState] = useState<AppData>(loadData);
  const [tab, setTab] = useState<Tab>(() => (loadData().settings.myName ? "calendar" : "settings"));
  const today = new Date();
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });
  const [selected, setSelected] = useState(todayISO());
  const [sheet, setSheet] = useState<SheetState>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [splash, setSplash] = useState(true);
  const hideSplash = useCallback(() => setSplash(false), []);
  const toastTimer = useRef<number | undefined>(undefined);

  // 下のバー: タップでハイライトが滑って移動し、指を滑らせるとハイライトがついてくる
  const navRef = useRef<HTMLElement>(null);
  const [segW, setSegW] = useState(0); // タブ 1 つ分の幅 (px)
  const [drag, setDrag] = useState<{ left: number; index: number } | null>(null);
  const press = useRef<{ startX: number; dragging: boolean } | null>(null);
  const tabIndex = TABS.findIndex((t) => t.id === tab);
  const NAV_PAD = 5;
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => setSegW((nav.clientWidth - NAV_PAD * 2) / TABS.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);
  /** バーの中の指の位置から、ハイライトの左端 (px) とタブ番号を出す */
  const pointerToTab = (clientX: number) => {
    const rect = navRef.current!.getBoundingClientRect();
    const left = Math.min(Math.max(clientX - rect.left - NAV_PAD - segW / 2, 0), segW * (TABS.length - 1));
    return { left, index: Math.round(left / segW) };
  };

  useEffect(() => saveData(data), [data]);
  // タブを切り替えたら一番上から見せる
  useEffect(() => window.scrollTo(0, 0), [tab]);

  const showToast = (t: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  };

  const store: Store = {
    data,
    setData: (fn) => setDataState(fn),
    upsertShift: (s) =>
      setDataState((d) => ({
        ...d,
        shifts: d.shifts.some((x) => x.id === s.id) ? d.shifts.map((x) => (x.id === s.id ? s : x)) : [...d.shifts, s],
      })),
    deleteShift: (id) => setDataState((d) => ({ ...d, shifts: d.shifts.filter((x) => x.id !== id) })),
    upsertEvent: (e) =>
      setDataState((d) => ({
        ...d,
        events: d.events.some((x) => x.id === e.id) ? d.events.map((x) => (x.id === e.id ? e : x)) : [...d.events, e],
      })),
    deleteEvent: (id) => setDataState((d) => ({ ...d, events: d.events.filter((x) => x.id !== id) })),
    addShifts: (ss) => setDataState((d) => ({ ...d, shifts: [...d.shifts, ...ss] })),
    addDaysOff: (list) =>
      setDataState((d) => {
        const dates = new Set(list.map((x) => x.date));
        return { ...d, daysOff: [...d.daysOff.filter((x) => !dates.has(x.date)), ...list] };
      }),
    setDayOff: (date, type) =>
      setDataState((d) => ({
        ...d,
        daysOff: [...d.daysOff.filter((x) => x.date !== date), ...(type ? [{ id: newId(), date, type }] : [])],
      })),
  };

  /** 削除して「元に戻す」を出す */
  const deleteWithUndo = (s: Shift) => {
    store.deleteShift(s.id);
    showToast({ message: `${s.start}〜${s.end} のシフトを削除しました`, undo: () => store.upsertShift(s) });
  };
  const deleteEventWithUndo = (e: CalEvent) => {
    store.deleteEvent(e.id);
    showToast({ message: `「${e.title}」を削除しました`, undo: () => store.upsertEvent(e) });
  };
  const clearOffWithUndo = (date: string, type: OffType) => {
    store.setDayOff(date, null);
    showToast({ message: `${type}を取り消しました`, undo: () => store.setDayOff(date, type) });
  };

  const selectDate = (iso: string) => {
    setSelected(iso);
    const d = parseISODate(iso);
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  return (
    <div className="app">
      <main className="app-main">
        {tab === "calendar" && (
          <HomeView
            store={store}
            ym={ym}
            setYm={setYm}
            selected={selected}
            onSelect={setSelected}
            onEdit={(s) => setSheet({ kind: "shift", shift: s, date: s.date })}
            onEditEvent={(e) => setSheet({ kind: "event", event: e, date: e.date })}
            onAdd={(date) => setSheet({ kind: "shift", shift: null, date })}
            onDeleteEvent={deleteEventWithUndo}
            onDelete={deleteWithUndo}
            onClearOff={clearOffWithUndo}
            goList={() => setTab("list")}
          />
        )}
        {tab === "import" && (
          <ImportView
            store={store}
            goSettings={() => setTab("settings")}
            onImported={(year, month) => {
              setYm({ year, month });
              setTab("calendar");
            }}
          />
        )}
        {tab === "list" && <ListView store={store} ym={ym} setYm={setYm} onEdit={(s) => setSheet({ kind: "shift", shift: s, date: s.date })} />}
        {tab === "settings" && <SettingsView store={store} />}
      </main>

      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              元に戻す
            </button>
          )}
        </div>
      )}

      <nav
        ref={navRef}
        className={`tabbar${drag ? " dragging" : ""}`}
        aria-label="メニュー"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          press.current = { startX: e.clientX, dragging: false };
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p) return;
          // 少し動かしてから「ドラッグ」とみなす (ただのタップではハイライトを指に飛ばさない)
          if (!p.dragging && Math.abs(e.clientX - p.startX) < 8) return;
          p.dragging = true;
          setDrag(pointerToTab(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!press.current) return;
          press.current = null;
          setTab(TABS[pointerToTab(e.clientX).index].id);
          setDrag(null);
        }}
        onPointerCancel={() => {
          press.current = null;
          setDrag(null);
        }}
      >
        <span
          className="tab-indicator"
          aria-hidden
          style={{
            width: segW || undefined,
            transform: `translateX(${drag ? drag.left : tabIndex * segW}px)${drag ? " scale(1.1, 1.04)" : ""}`,
          }}
        />
        {TABS.map((t, i) => {
          // ドラッグ中は指の下にあるタブを光らせる
          const lit = drag ? i === drag.index : tab === t.id;
          return (
            <button
              key={t.id}
              className={lit ? "active" : ""}
              aria-current={tab === t.id ? "page" : undefined}
              // キーボード操作用 (タッチ・マウスは nav の pointer イベントで切り替える)
              onClick={(e) => e.detail === 0 && setTab(t.id)}
            >
              <Icon name={t.icon} size={24} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
      <button
        className="fab"
        aria-label="シフトを追加"
        onClick={() => {
          if (tab !== "calendar") setTab("calendar");
          setSheet({ kind: "shift", shift: null, date: selected });
        }}
      >
        <Icon name="plus" size={30} strokeWidth={2.2} />
      </button>

      {sheet?.kind === "shift" && (
        <ShiftSheet
          key={`shift-${sheet.shift?.id ?? "new"}`}
          store={store}
          shift={sheet.shift}
          date={sheet.date}
          onClose={() => setSheet(null)}
          onSaved={(date, message) => {
            selectDate(date);
            showToast({ message });
          }}
          onDelete={(s) => {
            deleteWithUndo(s);
            setSheet(null);
          }}
          onSwitchToEvent={(date) => setSheet({ kind: "event", event: null, date })}
        />
      )}
      {sheet?.kind === "event" && (
        <EventSheet
          key={`event-${sheet.event?.id ?? "new"}`}
          store={store}
          event={sheet.event}
          date={sheet.date}
          onClose={() => setSheet(null)}
          onSaved={(date, message) => {
            selectDate(date);
            showToast({ message });
          }}
          onDelete={(e) => {
            deleteEventWithUndo(e);
            setSheet(null);
          }}
          onSwitchToShift={(date) => setSheet({ kind: "shift", shift: null, date })}
        />
      )}
      {splash && <Splash onDone={hideSplash} />}
    </div>
  );
}
