export type TimerPhase = "idle" | "running" | "paused";

export interface TimerState {
  readonly phase: TimerPhase;
  /** 直近の開始より前に積み上がった経過時間 */
  readonly accumulatedMs: number;
  /** 実行中のときの開始時刻（時計の値）。実行中以外は null */
  readonly startedAt: number | null;
}

export const initialTimer: TimerState = { phase: "idle", accumulatedMs: 0, startedAt: null };

export function startTimer(state: TimerState, now: number): TimerState {
  if (state.phase === "running") return state;
  return { phase: "running", accumulatedMs: state.accumulatedMs, startedAt: now };
}

export function pauseTimer(state: TimerState, now: number): TimerState {
  if (state.phase !== "running") return state;
  return { phase: "paused", accumulatedMs: elapsedMs(state, now), startedAt: null };
}

export function resetTimer(): TimerState {
  return initialTimer;
}

export function elapsedMs(state: TimerState, now: number): number {
  if (state.phase !== "running" || state.startedAt === null) return state.accumulatedMs;
  return state.accumulatedMs + Math.max(0, now - state.startedAt);
}

export function isOvertime(state: TimerState, now: number, endAtMs: number): boolean {
  return state.phase !== "idle" && elapsedMs(state, now) >= endAtMs;
}
