/** 追加シートの上の「シフト | 予定」切り替え */
export function KindSwitch({ value, onChange }: { value: "shift" | "event"; onChange: (v: "shift" | "event") => void }) {
  return (
    <div className="kind-switch" role="tablist" aria-label="追加するもの">
      {(["shift", "event"] as const).map((k) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? "on" : ""} onClick={() => value !== k && onChange(k)}>
          {k === "shift" ? "シフト" : "予定"}
        </button>
      ))}
    </div>
  );
}
