"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellPlayer, isAudioSupported } from "@/audio/bell-player";
import type { Bell, SoundId } from "@/lib/bells";
import { endMs } from "@/lib/schedule";
import { elapsedMs, initialTimer, isOvertime, type TimerState } from "@/lib/timer";
import { TimerController } from "@/lib/timer-controller";
import { createWakeLock } from "@/lib/wake-lock";

export function useTimer(bells: readonly Bell[], sound: SoundId) {
  const [controller, setController] = useState<TimerController | null>(null);
  const [timer, setTimer] = useState<TimerState>(initialTimer);
  const [now, setNow] = useState(0);
  const [audioSupported, setAudioSupported] = useState(true);
  const wakeLock = useMemo(() => createWakeLock(), []);

  // コントローラーはブラウザでのみ作る。画面を離れたら予約済みのベルをすべて止める。
  useEffect(() => {
    const supported = isAudioSupported();
    // AudioContext の有無はブラウザでしか分からないので、マウント後に反映する
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudioSupported(supported);
    const c = new TimerController(bells, supported ? new BellPlayer({ sound }) : null);
    const unsubscribe = c.subscribe(() => {
      setTimer(c.getState());
      setNow(performance.now());
    });
    setController(c);
    return () => {
      unsubscribe();
      void c.dispose();
    };
  }, [bells, sound]);

  // 実行中だけ毎フレーム表示を更新する
  useEffect(() => {
    if (timer.phase !== "running") return;
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [timer.phase]);

  // 実行中は画面スリープを防ぐ
  useEffect(() => {
    if (timer.phase !== "running") {
      void wakeLock.release();
      return;
    }
    void wakeLock.acquire();
    document.addEventListener("visibilitychange", wakeLock.onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", wakeLock.onVisibilityChange);
  }, [timer.phase, wakeLock]);

  useEffect(() => () => void wakeLock.release(), [wakeLock]);

  const toggle = useCallback(() => void controller?.toggle(), [controller]);
  const reset = useCallback(() => controller?.reset(), [controller]);
  const ringNow = useCallback(() => void controller?.ringNow(), [controller]);

  return {
    timer,
    elapsed: elapsedMs(timer, now),
    overtime: isOvertime(timer, now, endMs(bells)),
    ready: controller !== null,
    audioSupported,
    toggle,
    reset,
    ringNow,
  };
}
