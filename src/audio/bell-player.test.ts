import { describe, expect, it, vi } from "vitest";
import { SOUND_IDS } from "@/lib/bells";
import { BellPlayer } from "./bell-player";
import { SOUND_PRESETS } from "./sounds";

function fakeContext() {
  const oscillators: {
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
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
    const player = new BellPlayer({ createContext: f.create });
    await player.unlock();
    await player.unlock();
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.ctx.resume).toHaveBeenCalledTimes(1);
  });

  it("unlock 前の scheduleDelays・ringNow は何もしない", () => {
    const f = fakeContext();
    const player = new BellPlayer({ createContext: f.create });
    player.scheduleDelays([0]);
    player.ringNow();
    expect(f.oscillators).toHaveLength(0);
  });

  it("scheduleDelays は currentTime を基準に各打音を開始する", async () => {
    const f = fakeContext();
    const player = new BellPlayer({ createContext: f.create });
    await player.unlock();
    player.scheduleDelays([0, 1500]);
    const starts = f.oscillators.map((o) => o.start.mock.calls[0][0]);
    expect(new Set(starts)).toEqual(new Set([10, 11.5]));
    expect(f.oscillators).toHaveLength(SOUND_PRESETS["desk-bell"].partials.length * 2);
  });

  it("cancelAll で予約済みの全打音を止め、以後は二重に止めない", async () => {
    const f = fakeContext();
    const player = new BellPlayer({ createContext: f.create });
    await player.unlock();
    player.scheduleDelays([1000, 2000]);
    player.cancelAll();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true); // 予約時の stop(when) と取り消しの stop()
    player.cancelAll();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
  });

  it("close で全打音を止めて AudioContext を閉じる", async () => {
    const f = fakeContext();
    const player = new BellPlayer({ createContext: f.create });
    await player.unlock();
    player.scheduleDelays([1000]);
    await player.close();
    expect(f.ctx.close).toHaveBeenCalled();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
  });

  it("音色を省略すると卓上ベルで鳴らす", async () => {
    const f = fakeContext();
    const player = new BellPlayer({ createContext: f.create });
    expect(player.sound).toBe("desk-bell");
    await player.unlock();
    player.ringNow();
    const preset = SOUND_PRESETS["desk-bell"];
    expect(f.oscillators.map((o) => o.frequency.value)).toEqual(
      preset.partials.map((p) => preset.fundamentalHz * p.ratio),
    );
  });

  it.each(SOUND_IDS)("音色 %s: 指定した音色の倍音・波形・長さで各打音を予約する", async (sound) => {
    const f = fakeContext();
    const preset = SOUND_PRESETS[sound];
    const player = new BellPlayer({ sound, createContext: f.create });
    await player.unlock();
    player.scheduleDelays([0, 1500]);

    expect(f.oscillators).toHaveLength(preset.partials.length * 2);
    const first = f.oscillators.slice(0, preset.partials.length);
    expect(first.map((o) => o.frequency.value)).toEqual(preset.partials.map((p) => preset.fundamentalHz * p.ratio));
    expect(first.map((o) => o.type)).toEqual(preset.partials.map(() => preset.wave));
    expect(first.every((o) => o.start.mock.calls[0][0] === 10)).toBe(true);
    expect(first.every((o) => o.stop.mock.calls[0][0] === 10 + preset.decaySeconds)).toBe(true);
    const second = f.oscillators.slice(preset.partials.length);
    expect(second.every((o) => o.start.mock.calls[0][0] === 11.5)).toBe(true);
  });

  it("音色ごとに聞き分けられるよう、基音の高さか波形が互いに異なる", () => {
    const keys = SOUND_IDS.map((id) => `${SOUND_PRESETS[id].fundamentalHz}:${SOUND_PRESETS[id].wave}`);
    expect(new Set(keys).size).toBe(SOUND_IDS.length);
  });
});
