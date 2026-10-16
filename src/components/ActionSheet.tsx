import { createPortal } from "react-dom";

export interface Action {
  label: string;
  danger?: boolean;
  onClick: () => void;
}

/** iOS の下から出る選択肢 (「この日だけ」「これ以降すべて」など) */
export function ActionSheet({ title, actions, onCancel }: { title?: string; actions: Action[]; onCancel: () => void }) {
  // 下のシートの中に描くと、はみ出た部分が隠れるので body の直下に出す
  return createPortal(
    <div className="action-backdrop" onClick={onCancel}>
      <div className="action-sheet" role="dialog" aria-label={title ?? "選択"} onClick={(e) => e.stopPropagation()}>
        <div className="action-group">
          {title && <p className="action-title">{title}</p>}
          {actions.map((a) => (
            <button key={a.label} className={a.danger ? "danger" : ""} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
        <button className="action-cancel" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </div>,
    document.body,
  );
}
