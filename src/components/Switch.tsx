/** iOS の切り替えスイッチ */
export function Switch({ checked, onChange, labelledBy }: { checked: boolean; onChange: (on: boolean) => void; labelledBy?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      className={`ios-switch${checked ? " on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
