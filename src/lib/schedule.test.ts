import { describe, expect, it } from "vitest";
import { endMs, nextBell, planStrikes, STRIKE_INTERVAL_MS } from "./schedule";

const bells = [
  { at: 240, count: 1 },
  { at: 300, count: 3 },
];

describe("planStrikes", () => {
  it("開始時はすべての打音を予約し、複数回ベルは 350ms 間隔にする", () => {
    expect(planStrikes(bells, 0)).toEqual([
      { bellIndex: 0, atMs: 240_000, delayMs: 240_000 },
      { bellIndex: 1, atMs: 300_000, delayMs: 300_000 },
      { bellIndex: 1, atMs: 300_000 + STRIKE_INTERVAL_MS, delayMs: 300_000 + STRIKE_INTERVAL_MS },
      { bellIndex: 1, atMs: 300_000 + 2 * STRIKE_INTERVAL_MS, delayMs: 300_000 + 2 * STRIKE_INTERVAL_MS },
    ]);
  });

  it("再開時は過ぎたベルを除き、残り時間を delay にする", () => {
    expect(planStrikes(bells, 250_000).map((s) => [s.bellIndex, s.delayMs])).toEqual([
      [1, 50_000],
      [1, 50_350],
      [1, 50_700],
    ]);
  });

  it("複数回ベルの途中で再開すると、残りの打音だけを予約する", () => {
    expect(planStrikes(bells, 300_400).map((s) => s.atMs)).toEqual([300_700]);
  });

  it("ちょうど打音の時刻で再開した場合、その打音は鳴ったものとして除く", () => {
    expect(planStrikes(bells, 240_000).map((s) => s.atMs)[0]).toBe(300_000);
  });

  it("すべて過ぎていれば空", () => {
    expect(planStrikes(bells, 400_000)).toEqual([]);
  });
});

describe("endMs / nextBell", () => {
  it("終了時刻は最後のベルの時刻", () => {
    expect(endMs(bells)).toBe(300_000);
    expect(endMs([{ at: 90, count: 1 }, { at: 30, count: 1 }])).toBe(90_000);
  });

  it("次のベルは、経過時間より後の最初のベル", () => {
    expect(nextBell(bells, 0)).toEqual({ bell: bells[0], index: 0 });
    expect(nextBell(bells, 240_000)).toEqual({ bell: bells[1], index: 1 });
    expect(nextBell(bells, 300_000)).toBeNull();
  });
});
