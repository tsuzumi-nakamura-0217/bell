import { afterEach, describe, expect, it, vi } from "vitest";
import { SOUND_IDS } from "@/lib/bells";
import { BellPlayer, DRIFT_TOLERANCE_MS } from "./bell-player";
import { SOUND_PRESETS } from "./sounds";

function fakeContext() {
  const oscillators: {
    type: string;
    frequency: { value: number };
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const listeners = new Set<() => void>();
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn((target: unknown) => target), disconnect: vi.fn() });
  const ctx = {
    currentTime: 10,
    state: "suspended" as AudioContextState,
    destination: {},
    resume: vi.fn(async () => { ctx.state = "running"; }),
    close: vi.fn(async () => {}),
    addEventListener: vi.fn((type: string, listener: () => void) => { if (type === "statechange") listeners.add(listener); }),
    removeEventListener: vi.fn((type: string, listener: () => void) => { if (type === "statechange") listeners.delete(listener); }),
    /** 中断（画面ロックなど）から復帰したことにする */
    resumeAfterInterruption(currentTime: number) {
      ctx.currentTime = currentTime;
      ctx.state = "running";
      for (const listener of listeners) listener();
    },
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => {
      const osc = {
        ...node(),
        type: "sine",
        frequency: param(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null as (() => void) | null,
      };
      oscillators.push(osc);
      return osc;
    },
  };
  return { ctx, oscillators, listeners, create: vi.fn(() => ctx as unknown as AudioContext) };
}

function fakeKeepAlive() {
  const keepAlive = {
    playing: false,
    play: vi.fn(() => { keepAlive.playing = true; }),
    pause: vi.fn(() => { keepAlive.playing = false; }),
    close: vi.fn(),
  };
  return keepAlive;
}

/** 予約された打音の開始時刻（AudioContext の秒）を、止められていないものだけ返す */
function scheduledStarts(oscillators: ReturnType<typeof fakeContext>["oscillators"]): number[] {
  const starts = oscillators.filter((o) => o.stop.mock.calls.length === 1).map((o) => o.start.mock.calls[0][0] as number);
  return [...new Set(starts)].sort((a, b) => a - b);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  describe("消音モード・画面ロック対策", () => {
    it("unlock は resume を待つ前に（ユーザー操作の中で）、音声を再生扱いにして無音の再生を始める", async () => {
      const audioSession = { type: "auto" };
      vi.stubGlobal("navigator", { audioSession });
      const f = fakeContext();
      const keepAlive = fakeKeepAlive();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => keepAlive });

      const unlocking = player.unlock();
      expect(audioSession.type).toBe("playback");
      expect(keepAlive.play).toHaveBeenCalled();
      expect(f.ctx.resume).toHaveBeenCalled();
      await unlocking;
    });

    it("Audio Session API がないブラウザでも unlock できる", async () => {
      vi.stubGlobal("navigator", {});
      const f = fakeContext();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => null });
      await expect(player.unlock()).resolves.toBeUndefined();
    });

    it("鳴らすベルが残っているあいだだけ無音を再生し、すべて鳴り終わったら止める", async () => {
      const f = fakeContext();
      const keepAlive = fakeKeepAlive();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => keepAlive });
      await player.unlock();

      player.scheduleDelays([1000, 2000]);
      expect(keepAlive.playing).toBe(true);
      const [first, ...rest] = f.oscillators;
      first.onended?.();
      expect(keepAlive.playing).toBe(true);
      for (const osc of rest) osc.onended?.();
      expect(keepAlive.playing).toBe(false);

      player.ringNow();
      expect(keepAlive.playing).toBe(true);
      player.cancelAll();
      expect(keepAlive.playing).toBe(false);
    });

    it("鳴らすベルがなければ unlock で始めた無音の再生をすぐ止める", async () => {
      const f = fakeContext();
      const keepAlive = fakeKeepAlive();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => keepAlive });
      await player.unlock();
      player.scheduleDelays([]);
      expect(keepAlive.playing).toBe(false);
    });

    it("close で無音の再生を片付け、AudioContext の状態の監視をやめる", async () => {
      const f = fakeContext();
      const keepAlive = fakeKeepAlive();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => keepAlive });
      await player.unlock();
      expect(f.listeners.size).toBe(1);
      await player.close();
      expect(keepAlive.close).toHaveBeenCalled();
      expect(f.listeners.size).toBe(0);
    });

    it("中断で AudioContext の時計が止まっていたら、残りのベルだけを実時間に合わせて予約し直す", async () => {
      let wall = 0;
      const f = fakeContext();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => null, now: () => wall });
      await player.unlock();
      player.scheduleDelays([1000, 5000, 9000]); // AudioContext の 11, 15, 19 秒
      const original = [...f.oscillators];

      // 0.5 秒後に画面ロックで止まり、実時間で 6 秒後に復帰した
      f.ctx.state = "interrupted";
      wall = 6000;
      f.ctx.resumeAfterInterruption(10.5);

      expect(original.every((o) => o.stop.mock.calls.length === 2)).toBe(true);
      // 止まっていた間の 1 秒・5 秒のベルは鳴らさず、9 秒のベルは今から 3 秒後に鳴らす
      expect(scheduledStarts(f.oscillators)).toEqual([13.5]);

      // 予約し直した後も、さらにずれれば同じように合わせる
      wall = 7000;
      f.ctx.resumeAfterInterruption(10.5);
      expect(scheduledStarts(f.oscillators)).toEqual([12.5]);
    });

    it("時計のずれが許容範囲内なら予約し直さない", async () => {
      let wall = 0;
      const f = fakeContext();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => null, now: () => wall });
      await player.unlock();
      player.scheduleDelays([5000]);
      const count = f.oscillators.length;

      wall = 3000;
      f.ctx.resumeAfterInterruption(13 - (DRIFT_TOLERANCE_MS - 1) / 1000);
      expect(f.oscillators).toHaveLength(count);
      expect(scheduledStarts(f.oscillators)).toEqual([15]);
    });

    it("一時停止中（予約なし）や AudioContext が止まっているあいだは予約し直さない", async () => {
      let wall = 0;
      const f = fakeContext();
      const player = new BellPlayer({ createContext: f.create, createKeepAlive: () => null, now: () => wall });
      await player.unlock();
      player.scheduleDelays([5000]);
      const count = f.oscillators.length;

      wall = 3000;
      f.ctx.state = "interrupted";
      player.resync();
      expect(f.oscillators).toHaveLength(count);

      player.cancelAll();
      f.ctx.resumeAfterInterruption(10);
      expect(f.oscillators).toHaveLength(count);
    });
  });
});
