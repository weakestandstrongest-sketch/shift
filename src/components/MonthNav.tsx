import { addMonths } from "../lib/date";
import { Icon } from "./Icon";

export interface YM {
  year: number;
  month: number;
}

/** 中央に「2026年10月」、左右に丸い矢印ボタンの月切り替え */
export function MonthNav({ ym, setYm, caption }: { ym: YM; setYm: (ym: YM) => void; caption?: string }) {
  return (
    <div className="month-nav">
      <button className="round-btn filled" aria-label="前の月" onClick={() => setYm(addMonths(ym.year, ym.month, -1))}>
        <Icon name="left" size={22} />
      </button>
      <div className="month-nav-title">
        {caption && <span className="month-nav-caption">{caption}</span>}
        <h2>
          {ym.year}年{ym.month}月
        </h2>
      </div>
      <button className="round-btn filled" aria-label="次の月" onClick={() => setYm(addMonths(ym.year, ym.month, 1))}>
        <Icon name="right" size={22} />
      </button>
    </div>
  );
}
