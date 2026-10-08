import { describe, expect, it, vi } from "vitest";
import { TimerController, type StrikePlayer } from "./timer-controller";

const bells = [
  { at: 2, count: 1 },
  { at: 4, count: 2 },
];

function fakePlayer() {
  let releaseUnlock: () => void = () => {};
  const player = {
    unlock: vi.fn(() => new Promise<void>((resolve) => { releaseUnlock = resolve; })),
    scheduleDelays: vi.fn(),
    ringNow: vi.fn(),
    cancelAll: vi.fn(),
    close: vi.fn(async () => {}),
  } satisfies StrikePlayer;
  return { player, releaseUnlock: () => releaseUnlock() };
}

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("TimerController", () => {
  it("開始時に unlock してから全打音を予約し、running にする", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const clock = fakeClock();
    const c = new TimerController(bells, player, clock.now);
    const p = c.toggle();
    releaseUnlock();
    await p;
    expect(player.scheduleDelays).toHaveBeenCalledWith([2000, 4000, 4350]);
    expect(c.getState().phase).toBe("running");
  });

  it("toggle の多重呼び出し（スタートの二重クリック）でも予約は1回だけ", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p1 = c.toggle();
    const p2 = c.toggle();
    releaseUnlock();
    await Promise.all([p1, p2]);
    expect(player.scheduleDelays).toHaveBeenCalledTimes(1);
    expect(c.getState().phase).toBe("running");
  });

  it("一時停止で予約を取り消し、再開時は残りの打音だけを予約する", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const clock = fakeClock();
    const c = new TimerController(bells, player, clock.now);
    let p = c.toggle(); releaseUnlock(); await p;
    clock.advance(3000);
    await c.toggle();
    expect(player.cancelAll).toHaveBeenCalledTimes(1);
    expect(c.getState()).toMatchObject({ phase: "paused", accumulatedMs: 3000 });
    clock.advance(10_000);
    p = c.toggle(); releaseUnlock(); await p;
    expect(player.scheduleDelays).toHaveBeenLastCalledWith([1000, 1350]);
  });

  it("reset で予約を取り消し、待機状態に戻す", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p = c.toggle(); releaseUnlock(); await p;
    c.reset();
    expect(player.cancelAll).toHaveBeenCalled();
    expect(c.getState().phase).toBe("idle");
  });

  it("unlock が失敗してもタイマーは動く", async () => {
    const { player } = fakePlayer();
    player.unlock.mockRejectedValueOnce(new Error("blocked"));
    const c = new TimerController(bells, player, fakeClock().now);
    await c.toggle();
    expect(c.getState().phase).toBe("running");
  });

  it("player が null（音が使えない環境）でもタイマーは動く", async () => {
    const c = new TimerController(bells, null, fakeClock().now);
    await c.toggle();
    expect(c.getState().phase).toBe("running");
  });

  it("状態が変わると subscribe したリスナーを呼ぶ。解除後は呼ばない", async () => {
    const c = new TimerController(bells, null, fakeClock().now);
    const listener = vi.fn();
    const unsubscribe = c.subscribe(listener);
    await c.toggle();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    c.reset();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("dispose で予約を取り消して音を閉じ、その後の toggle は何もしない", async () => {
    const { player } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    await c.dispose();
    expect(player.cancelAll).toHaveBeenCalled();
    expect(player.close).toHaveBeenCalled();
    await c.toggle();
    expect(player.scheduleDelays).not.toHaveBeenCalled();
  });

  it("unlock を待っている間に dispose されたら、予約しない", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p = c.toggle();
    await c.dispose();
    releaseUnlock();
    await p;
    expect(player.scheduleDelays).not.toHaveBeenCalled();
  });

  it("ringNow で unlock してから1回鳴らす", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    const p = c.ringNow(); releaseUnlock(); await p;
    expect(player.ringNow).toHaveBeenCalledTimes(1);
  });

  it("実行中にミュートすると予約を取り消し、解除すると今から残りの打音を予約する", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const clock = fakeClock();
    const c = new TimerController(bells, player, clock.now);
    let p = c.toggle(); releaseUnlock(); await p;
    clock.advance(1000);
    await c.setMuted(true);
    expect(c.isMuted()).toBe(true);
    expect(player.cancelAll).toHaveBeenCalledTimes(1);
    clock.advance(2500);
    p = c.setMuted(false); releaseUnlock(); await p;
    expect(c.isMuted()).toBe(false);
    expect(player.scheduleDelays).toHaveBeenLastCalledWith([500, 850]);
    expect(c.getState().phase).toBe("running");
  });

  it("ミュート中にスタート・再開しても予約しない", async () => {
    const { player, releaseUnlock } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    await c.setMuted(true);
    const p = c.toggle(); releaseUnlock(); await p;
    expect(c.getState().phase).toBe("running");
    expect(player.scheduleDelays).not.toHaveBeenCalled();
  });

  it("停止中にミュートを解除しても予約しない", async () => {
    const { player } = fakePlayer();
    const c = new TimerController(bells, player, fakeClock().now);
    await c.setMuted(true);
    await c.setMuted(false);
    expect(player.scheduleDelays).not.toHaveBeenCalled();
  });

  it("ミュートの切り替えで subscribe したリスナーを呼ぶ", async () => {
    const c = new TimerController(bells, null, fakeClock().now);
    const listener = vi.fn();
    c.subscribe(listener);
    await c.setMuted(true);
    await c.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
