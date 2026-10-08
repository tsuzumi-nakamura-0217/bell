import { DEFAULT_SOUND, type SoundId } from "@/lib/bells";
import type { StrikePlayer } from "@/lib/timer-controller";
import { preferPlaybackAudioSession } from "./audio-session";
import { createSilentKeepAlive, type KeepAlive } from "./keep-alive";
import { SOUND_PRESETS } from "./sounds";

/** AudioContext の時計が実時間からこれ以上ずれていたら、止まっていたとみなして予約し直す */
export const DRIFT_TOLERANCE_MS = 500;

export function isAudioSupported(): boolean {
  return typeof window !== "undefined" && typeof window.AudioContext === "function";
}

interface StrikePlan {
  /** 予約したときの AudioContext の時刻（秒）と実時間（ミリ秒） */
  ctxStart: number;
  wallStart: number;
  delaysMs: readonly number[];
}

export class BellPlayer implements StrikePlayer {
  private ctx: AudioContext | null = null;
  private keepAlive: KeepAlive | null | undefined;
  private plan: StrikePlan | null = null;
  private readonly active = new Set<OscillatorNode>();

  readonly sound: SoundId;
  private readonly createContext: () => AudioContext;
  private readonly createKeepAlive: () => KeepAlive | null;
  private readonly now: () => number;

  constructor(
    options: {
      sound?: SoundId;
      createContext?: () => AudioContext;
      createKeepAlive?: () => KeepAlive | null;
      now?: () => number;
    } = {},
  ) {
    this.sound = options.sound ?? DEFAULT_SOUND;
    this.createContext = options.createContext ?? (() => new AudioContext());
    this.createKeepAlive = options.createKeepAlive ?? createSilentKeepAlive;
    this.now = options.now ?? (() => performance.now());
  }

  /** 最初の await までは同期で動くので、クリックなどのユーザー操作の中から呼ぶ */
  async unlock(): Promise<void> {
    preferPlaybackAudioSession();
    if (!this.ctx) {
      this.ctx = this.createContext();
      this.ctx.addEventListener("statechange", this.resync);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", this.resync);
    }
    if (this.keepAlive === undefined) this.keepAlive = this.createKeepAlive();
    // iOS ではメディアの再生許可をユーザー操作の中でしか取れないので、ここで始めておく（鳴らすベルがなければ予約後に止まる）
    this.keepAlive?.play();
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  scheduleDelays(delaysMs: readonly number[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const base = ctx.currentTime;
    this.plan = { ctxStart: base, wallStart: this.now(), delaysMs };
    for (const delay of delaysMs) this.strikeAt(ctx, base + delay / 1000);
    this.updateKeepAlive();
  }

  ringNow(): void {
    if (!this.ctx) return;
    this.strikeAt(this.ctx, this.ctx.currentTime);
    this.updateKeepAlive();
  }

  cancelAll(): void {
    this.stopAll();
    this.plan = null;
    this.updateKeepAlive();
  }

  /**
   * 画面ロックや電話の着信などで AudioContext が止まっていたら、その間の時計も止まっているので、
   * 予約済みのベルがすべて遅れて鳴る。実時間とずれていたら、残りのベルを今の時刻から予約し直す。
   * 止まっていた間に鳴るはずだったベルは鳴らさない。
   */
  readonly resync = (): void => {
    const { ctx, plan } = this;
    if (!ctx || !plan || ctx.state !== "running") return;
    const wallElapsed = this.now() - plan.wallStart;
    const audioElapsed = (ctx.currentTime - plan.ctxStart) * 1000;
    if (Math.abs(wallElapsed - audioElapsed) < DRIFT_TOLERANCE_MS) return;
    this.stopAll();
    this.scheduleDelays(plan.delaysMs.map((delay) => delay - wallElapsed).filter((delay) => delay > 0));
  };

  async close(): Promise<void> {
    this.cancelAll();
    this.keepAlive?.close();
    this.keepAlive = null;
    const ctx = this.ctx;
    this.ctx = null;
    if (!ctx) return;
    ctx.removeEventListener("statechange", this.resync);
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", this.resync);
    await ctx.close();
  }

  private stopAll(): void {
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

  /** 鳴らす予定のベルがあるあいだだけ、無音を流してページを止めさせない */
  private updateKeepAlive(): void {
    if (this.active.size > 0) this.keepAlive?.play();
    else this.keepAlive?.pause();
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
        this.updateKeepAlive();
      };
    }
  }
}
