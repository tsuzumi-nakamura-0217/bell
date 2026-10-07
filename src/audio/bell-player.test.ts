import { describe, expect, it, vi } from "vitest";
import { BellPlayer } from "./bell-player";

function fakeContext() {
  const oscillators: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn((target: unknown) => target), disconnect: vi.fn() });
  const ctx = {
    currentTime: 10,
    state: "suspended" as AudioContextState,
    destination: {},
    resume: vi.fn(async () => { ctx.state = "running"; }),
    close: vi.fn(async () => {}),
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const osc = { ...node(), type: "sine", frequency: param(), start: vi.fn(), stop: vi.fn(), onended: null };
      oscillators.push(osc);
      return osc;
    },
  };
  return { ctx, oscillators, create: vi.fn(() => ctx as unknown as AudioContext) };
}

describe("BellPlayer", () => {
  it("unlock で AudioContext を作り、suspended なら resume する", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    await player.unlock();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("unlock 前の scheduleDelays・ringNow は何もしない", () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    player.scheduleDelays([0]);
    player.ringNow();
    expect(f.oscillators).toHaveLength(0);
  });

  it("scheduleDelays は currentTime を基準に各打音を開始する", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    player.scheduleDelays([0, 1500]);
    const starts = f.oscillators.map((o) => o.start.mock.calls[0][0]);
    expect(new Set(starts)).toEqual(new Set([10, 11.5]));
    expect(f.oscillators).toHaveLength(8); // 4つの倍音 × 2打音
  });

  it("cancelAll で予約済みの全打音を止め、以後は二重に止めない", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    player.scheduleDelays([1000, 2000]);
    player.cancelAll();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true); // 予約時の stop(when) と取り消しの stop()
    player.cancelAll();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
  });

  it("close で全打音を止めて AudioContext を閉じる", async () => {
    const f = fakeContext();
    const player = new BellPlayer(f.create);
    await player.unlock();
    player.scheduleDelays([1000]);
    await player.close();
    expect(f.ctx.close).toHaveBeenCalled();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
  });
});
