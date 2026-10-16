import { useEffect, useRef, useState } from "react";
import type { AppData, DayOff, OffType, Shift } from "./types";
import { loadData, saveData } from "./lib/storage";
import { newId } from "./lib/shift";
import { parseISODate, todayISO } from "./lib/date";
import { HomeView } from "./components/HomeView";
import { ImportView } from "./components/ImportView";
import { ListView } from "./components/ListView";
import { SettingsView } from "./components/SettingsView";
import { ShiftSheet } from "./components/ShiftSheet";
import { Icon, type IconName } from "./components/Icon";

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
  addShifts: (s: Shift[]) => void;
  /** 休みを登録する。同じ日の休みは置き換える */
  addDaysOff: (d: DayOff[]) => void;
  /** その日の休みを設定する (null で取り消し) */
  setDayOff: (date: string, type: OffType | null) => void;
}

/** 追加・編集シートの状態 */
export type SheetState = { shift: Shift | null; date: string } | null;

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
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => saveData(data), [data]);

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
            onEdit={(s) => setSheet({ shift: s, date: s.date })}
            onAdd={(date) => setSheet({ shift: null, date })}
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
        {tab === "list" && <ListView store={store} ym={ym} setYm={setYm} onEdit={(s) => setSheet({ shift: s, date: s.date })} />}
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

      <nav className="tabbar" aria-label="メニュー">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={24} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <button
        className="fab"
        aria-label="シフトを追加"
        onClick={() => {
          if (tab !== "calendar") setTab("calendar");
          setSheet({ shift: null, date: selected });
        }}
      >
        <Icon name="plus" size={30} strokeWidth={2.2} />
      </button>

      {sheet && (
        <ShiftSheet
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
        />
      )}
    </div>
  );
}
