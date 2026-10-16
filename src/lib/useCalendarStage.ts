import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

/**
 * カレンダーの表示段階。0 = 1週間だけ、1 = ふつうの月、2 = 予定の名前まで見える月。
 * 途中の値 (0.4 など) もとり、ドラッグ・ピンチ中は指に合わせて連続的に変わる。
 *
 * なめらかに動かすため、毎フレームの値は React で描き直さず、要素の CSS 変数 --s に直接書く。
 * 行の高さや文字の濃さは CSS がその値から計算する。React には段階 (0/1/2) が変わったときだけ知らせる。
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

/** ばねの固さ (1/ms)。iOS のアニメーションに近い、0.45 秒ほどで落ち着く値 */
const OMEGA = (2 * Math.PI) / 450;

const levelOf = (v: number) => (v < 0.5 ? 0 : v < 1.5 ? 1 : 2);

export function useCalendarStage(el: RefObject<HTMLElement | null>) {
  const current = useRef<number>(NaN);
  if (Number.isNaN(current.current)) current.current = loadStage();
  /** いまいちばん近い段階 (0/1/2) */
  const [level, setLevel] = useState(() => levelOf(current.current));
  const frame = useRef<number | undefined>(undefined);

  const set = useCallback(
    (v: number) => {
      current.current = v;
      el.current?.style.setProperty("--s", v.toFixed(4));
      setLevel(levelOf(v)); // 同じ値なら React は描き直さない
    },
    [el],
  );

  // 最初の表示の前に値を入れておく
  useLayoutEffect(() => {
    el.current?.style.setProperty("--s", String(current.current));
  }, [el]);

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
      let t0: number | undefined;
      const step = (now: number) => {
        t0 ??= now - 8; // 最初のフレームから少し進めて、止まって見える 1 コマをなくす
        const t = now - t0;
        const e = Math.exp(-OMEGA * t);
        const x = (A + B * t) * e;
        const v = (B - OMEGA * (A + B * t)) * e;
        if (Math.abs(x) < 0.001 && Math.abs(v) < 0.0001) {
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

  return { level, current, animateTo, follow };
}
