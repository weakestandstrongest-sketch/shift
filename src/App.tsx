import { useEffect, useState } from "react";
import type { AppData, DayOff, OffType, Shift } from "./types";
import { loadData, saveData } from "./lib/storage";
import { newId } from "./lib/shift";
import { CalendarView } from "./components/CalendarView";
import { ImportView } from "./components/ImportView";
import { ListView } from "./components/ListView";
import { SettingsView } from "./components/SettingsView";

type Tab = "calendar" | "import" | "list" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "calendar", label: "カレンダー", icon: "📅" },
  { id: "import", label: "写真で取込", icon: "📷" },
  { id: "list", label: "一覧・給料", icon: "💴" },
  { id: "settings", label: "設定", icon: "⚙️" },
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

export default function App() {
  const [data, setDataState] = useState<AppData>(loadData);
  const [tab, setTab] = useState<Tab>(() => (loadData().settings.myName ? "calendar" : "settings"));
  const today = new Date();
  const [ym, setYm] = useState({ year: today.getFullYear(), month: today.getMonth() + 1 });

  useEffect(() => saveData(data), [data]);

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

  return (
    <div className="app">
      <header className="app-header">
        <h1>シフト帳</h1>
        {data.settings.myName && <span className="me">{data.settings.myName} さん</span>}
      </header>
      <main className="app-main">
        {tab === "calendar" && <CalendarView store={store} ym={ym} setYm={setYm} />}
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
        {tab === "list" && <ListView store={store} ym={ym} setYm={setYm} />}
        {tab === "settings" && <SettingsView store={store} />}
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            <span className="tab-icon" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
