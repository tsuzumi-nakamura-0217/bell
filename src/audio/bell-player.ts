import { DEFAULT_SOUND, type SoundId } from "@/lib/bells";
import type { StrikePlayer } from "@/lib/timer-controller";
import { SOUND_PRESETS } from "./sounds";


export function isAudioSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext === "function";
}

export class BellPlayer implements StrikePlayer {
  private ctx: AudioContext | null = null;
  private readonly active = new Set<OscillatorNode>();

  readonly sound: SoundId;
  private readonly createContext: () => AudioContext;

  constructor(options: { sound?: SoundId; createContext?: () => AudioContext } = {}) {
    this.sound = options.sound ?? DEFAULT_SOUND;
    this.createContext = options.createContext ?? (() => new AudioContext());
  }

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
    const preset = SOUND_PRESETS[this.sound];
    const end = when + preset.decaySeconds;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, when);
    master.gain.exponentialRampToValueAtTime(preset.peakGain, when + preset.attackSeconds);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    master.connect(ctx.destination);

    for (const partial of preset.partials) {
      const osc = ctx.createOscillator();
      osc.type = preset.wave;
      osc.frequency.value = preset.fundamentalHz * partial.ratio;
      const gain = ctx.createGain();
      gain.gain.value = partial.gain;
      osc.connect(gain).connect(master);
      osc.start(when);
      osc.stop(end);
      this.active.add(osc);
      osc.onended = () => {
        this.active.delete(osc);
        osc.disconnect();
      };
    }
  }
}
