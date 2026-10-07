import { describe, expect, it } from "vitest";
import { elapsedMs, initialTimer, isOvertime, pauseTimer, resetTimer, startTimer } from "./timer";

describe("timer", () => {
  it("開始から現在時刻までの差を経過時間とする", () => {
    const s = startTimer(initialTimer, 1000);
    expect(s.phase).toBe("running");
    expect(elapsedMs(s, 4500)).toBe(3500);
  });

  it("一時停止中の時間は経過時間に含めない", () => {
    let s = startTimer(initialTimer, 0);
    s = pauseTimer(s, 2000);
    expect(s.phase).toBe("paused");
    expect(elapsedMs(s, 9000)).toBe(2000);
    s = startTimer(s, 10_000);
    expect(elapsedMs(s, 11_000)).toBe(3000);
  });

  it("実行中の startTimer、実行中以外の pauseTimer は何もしない", () => {
    const running = startTimer(initialTimer, 0);
    expect(startTimer(running, 500)).toBe(running);
    expect(pauseTimer(initialTimer, 500)).toBe(initialTimer);
  });

  it("現在時刻が開始時刻より前でも経過時間は減らない", () => {
    const s = startTimer({ phase: "paused", accumulatedMs: 1000, startedAt: null }, 5000);
    expect(elapsedMs(s, 4000)).toBe(1000);
  });

  it("resetTimer で待機状態に戻る", () => {
    expect(resetTimer()).toEqual({ phase: "idle", accumulatedMs: 0, startedAt: null });
  });

  it("終了時刻以降は超過。待機中は超過にしない。一時停止中も超過は保つ", () => {
    const s = startTimer(initialTimer, 0);
    expect(isOvertime(s, 4999, 5000)).toBe(false);
    expect(isOvertime(s, 5000, 5000)).toBe(true);
    expect(isOvertime(pauseTimer(s, 6000), 99_999, 5000)).toBe(true);
    expect(isOvertime(initialTimer, 99_999, 0)).toBe(false);
  });
});
