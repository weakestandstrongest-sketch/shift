import { addMonths } from "../lib/date";

export interface YM {
  year: number;
  month: number;
}

export function MonthNav({ ym, setYm }: { ym: YM; setYm: (ym: YM) => void }) {
  const now = new Date();
  const isCurrent = ym.year === now.getFullYear() && ym.month === now.getMonth() + 1;
  return (
    <div className="month-nav">
      <button className="icon-btn" aria-label="前の月" onClick={() => setYm(addMonths(ym.year, ym.month, -1))}>
        ‹
      </button>
      <h2>
        {ym.year}年{ym.month}月
      </h2>
      <button className="icon-btn" aria-label="次の月" onClick={() => setYm(addMonths(ym.year, ym.month, 1))}>
        ›
      </button>
      {!isCurrent && (
        <button className="link-btn" onClick={() => setYm({ year: now.getFullYear(), month: now.getMonth() + 1 })}>
          今月
        </button>
      )}
    </div>
  );
}
