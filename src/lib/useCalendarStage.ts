import { useCallback, useEffect, useRef, useState } from "react";

/**
 * カレンダーの表示段階。0 = 1週間だけ、1 = ふつうの月、2 = 予定の名前まで見える月。
 * 途中の値 (0.4 など) もとり、ドラッグ中は指に合わせて連続的に変わる。
 */
const KEY = "shift-app:calStage";

function loadStage(): number {
  try {
    const v = localStorage.getItem(KEY);
    return v === "0" ? 0 : v === "2" ? 2 : 1;
  } catch {
    return 1;
  }
}

/** ばねの固さ (1/ms)。iOS のアニメーションに近い、0.4 秒ほどで落ち着く値 */
const OMEGA = (2 * Math.PI) / 420;

export function useCalendarStage() {
  const [stage, setStageState] = useState(loadStage);
  const current = useRef(stage);
  const frame = useRef<number | undefined>(undefined);

  const set = useCallback((v: number) => {
    current.current = v;
    setStageState(v);
  }, []);

  const stop = () => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  };

  /**
   * 目標の段階まで、ばねの動きでなめらかに動かす。
   * velocity (段階/ms) は指を離したときの速さで、それを引き継ぐので離した瞬間にがくっとならない。
   */
  const animateTo = useCallback(
    (target: number, velocity = 0) => {
      stop();
      const save = () => {
        try {
          localStorage.setItem(KEY, String(target));
        } catch {
          // 保存できなくても表示はそのまま
        }
      };
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        set(target);
        return save();
      }
      // 臨界減衰のばね: x(t) = target + (A + B t) e^(-ωt)
      const A = current.current - target;
      const B = velocity + OMEGA * A;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = now - t0;
        const e = Math.exp(-OMEGA * t);
        const x = (A + B * t) * e;
        const v = (B - OMEGA * (A + B * t)) * e;
        if (Math.abs(x) < 0.002 && Math.abs(v) < 0.0002) {
          frame.current = undefined;
          set(target);
          return save();
        }
        set(target + x);
        frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [set],
  );

  useEffect(() => stop, []);

  /** ドラッグ中は指に合わせて直接動かす (アニメーションは止める) */
  const follow = useCallback(
    (v: number) => {
      stop();
      set(v);
    },
    [set],
  );

  return { stage, current, animateTo, follow };
}
