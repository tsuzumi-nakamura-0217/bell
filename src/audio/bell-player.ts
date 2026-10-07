import type { StrikePlayer } from "@/lib/timer-controller";

/** 卓上ベル風の倍音構成（基音に対する周波数比と相対音量） */
const PARTIALS = [
  { ratio: 1, gain: 1 },
  { ratio: 2.0, gain: 0.35 },
  { ratio: 2.76, gain: 0.3 },
  { ratio: 5.4, gain: 0.12 },
] as const;
const FUNDAMENTAL_HZ = 1760;
const DECAY_SECONDS = 1.6;
const PEAK_GAIN = 0.5;

export function isAudioSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext === "function";
}

export class BellPlayer implements StrikePlayer {
  private ctx: AudioContext | null = null;
  private readonly active = new Set<OscillatorNode>();

  constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

  async unlock(): Promise<void> {
    this.ctx ??= this.createContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  scheduleDelays(delaysMs: readonly number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = ctx.currentTime;
    for (const delay of delaysMs) this.strikeAt(ctx, base + delay / 1000);
  }

  ringNow(): void {
    if (this.ctx) this.strikeAt(this.ctx, this.ctx.currentTime);
  }

  cancelAll(): void {
    for (const osc of this.active) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        // すでに停止済み
      }
      osc.disconnect();
    }
    this.active.clear();
  }

  async close(): Promise<void> {
    this.cancelAll();
    const ctx = this.ctx;
    this.ctx = null;
    await ctx?.close();
  }

  private strikeAt(ctx: AudioContext, when: number): void {
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, when);
    master.gain.exponentialRampToValueAtTime(PEAK_GAIN, when + 0.005);
    master.gain.exponentialRampToValueAtTime(0.0001, when + DECAY_SECONDS);
    master.connect(ctx.destination);

    for (const partial of PARTIALS) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = FUNDAMENTAL_HZ * partial.ratio;
      const gain = ctx.createGain();
      gain.gain.value = partial.gain;
      osc.connect(gain).connect(master);
      osc.start(when);
      osc.stop(when + DECAY_SECONDS);
      this.active.add(osc);
      osc.onended = () => {
        this.active.delete(osc);
        osc.disconnect();
      };
    }
  }
}
