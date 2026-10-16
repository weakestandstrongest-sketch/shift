import { useEffect, useState } from "react";

const DURATION = 1900; // ms (最後のフェードアウトまで)

/**
 * 起動アニメーション: アイコンのカレンダーが上から落ちてきて「ぷにっ」とつぶれ、
 * 線と緑の点が飛び出してから、アプリの画面へフェードする。タップで飛ばせる。
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const leaveAt = reduce ? 500 : DURATION - 350;
    const t1 = window.setTimeout(() => setLeaving(true), leaveAt);
    const t2 = window.setTimeout(onDone, leaveAt + 350);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      className={`splash${leaving ? " leaving" : ""}`}
      aria-hidden
      onClick={() => {
        setLeaving(true);
        window.setTimeout(onDone, 300);
      }}
    >
      <svg className="splash-art" viewBox="40 40 432 432" width="220" height="220">
        <ellipse className="sp-shadow" cx="256" cy="402" rx="168" ry="18" />
        <g className="sp-cal">
          <path d="M110 232c0-34 24-56 60-56h172c36 0 60 22 60 56v112c0 40-26 58-66 58H176c-40 0-66-18-66-58z" fill="#fff" />
          <path d="M110 232c0-34 24-56 60-56h172c36 0 60 22 60 56v6H110z" fill="#ffd9d1" />
          <rect x="172" y="150" width="34" height="58" rx="17" fill="#fff" />
          <rect x="306" y="150" width="34" height="58" rx="17" fill="#fff" />
          <g fill="#ee6f61">
            <circle cx="186" cy="290" r="13" />
            <circle cx="256" cy="290" r="13" />
            <circle cx="326" cy="290" r="13" />
            <circle cx="186" cy="346" r="13" />
            <circle cx="256" cy="346" r="13" />
          </g>
          <circle className="sp-dot" cx="326" cy="346" r="13" fill="#30d158" />
        </g>
        <g className="sp-lines" stroke="#fff" strokeWidth="14" strokeLinecap="round">
          <path d="M196 84l12 34" />
          <path d="M256 72v38" />
          <path d="M316 84l-12 34" />
          <path d="M70 290h22" strokeWidth="12" />
          <path d="M420 290h22" strokeWidth="12" />
        </g>
      </svg>
      <p className="splash-name">ぷにシフト</p>
    </div>
  );
}
