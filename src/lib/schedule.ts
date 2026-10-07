import type { Bell } from "./bells";

export const STRIKE_INTERVAL_MS = 350;

export interface Strike {
  bellIndex: number;
  /** タイマー開始からの打音時刻 */
  atMs: number;
  /** 経過時間 elapsed から打音までの待ち時間 */
  delayMs: number;
}

/** elapsed より後に鳴るべき打音を、時刻順に返す。 */
export function planStrikes(bells: readonly Bell[], elapsed: number): Strike[] {
  const strikes: Strike[] = [];
  bells.forEach((bell, bellIndex) => {
    for (let k = 0; k < bell.count; k++) {
      const atMs = bell.at * 1000 + k * STRIKE_INTERVAL_MS;
      if (atMs > elapsed) strikes.push({ bellIndex, atMs, delayMs: atMs - elapsed });
    }
  });
  return strikes.sort((a, b) => a.atMs - b.atMs);
}

export function endMs(bells: readonly Bell[]): number {
  return Math.max(...bells.map((bell) => bell.at)) * 1000;
}

export function nextBell(bells: readonly Bell[], elapsed: number): { bell: Bell; index: number } | null {
  const index = bells.findIndex((bell) => bell.at * 1000 > elapsed);
  return index === -1 ? null : { bell: bells[index], index };
}
