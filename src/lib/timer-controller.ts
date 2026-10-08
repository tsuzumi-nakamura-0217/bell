import type { Bell } from "./bells";
import { planStrikes } from "./schedule";
import { elapsedMs, initialTimer, pauseTimer, resetTimer, startTimer, type TimerState } from "./timer";

export interface StrikePlayer {
  unlock(): Promise<void>;
  scheduleDelays(delaysMs: readonly number[]): void;
  ringNow(): void;
  cancelAll(): void;
  close(): Promise<void>;
}

export class TimerController {
  private state: TimerState = initialTimer;
  private muted = false;
  private starting = false;
  private disposed = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly bells: readonly Bell[],
    private readonly player: StrikePlayer | null,
    private readonly clock: () => number = () => performance.now(),
  ) {}

  getState(): TimerState {
    return this.state;
  }

  isMuted(): boolean {
    return this.muted;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async toggle(): Promise<void> {
    if (this.disposed || this.starting) return;
    if (this.state.phase === "running") {
      this.player?.cancelAll();
      this.setState(pauseTimer(this.state, this.clock()));
      return;
    }
    this.starting = true;
    try {
      await this.unlockSafely();
      if (this.disposed) return;
      const now = this.clock();
      if (!this.muted) this.scheduleFrom(this.state.accumulatedMs);
      this.setState(startTimer(this.state, now));
    } finally {
      this.starting = false;
    }
  }

  reset(): void {
    if (this.disposed) return;
    this.player?.cancelAll();
    this.setState(resetTimer());
  }

  /** ミュート中は予約済みのベルを取り消し、以降も鳴らさない。解除すると残りのベルを今から予約し直す。 */
  async setMuted(muted: boolean): Promise<void> {
    if (this.disposed || muted === this.muted) return;
    this.muted = muted;
    this.notify();
    if (muted) {
      this.player?.cancelAll();
      return;
    }
    if (this.state.phase !== "running") return;
    await this.unlockSafely();
    if (this.disposed || this.muted || this.state.phase !== "running") return;
    this.scheduleFrom(elapsedMs(this.state, this.clock()));
  }

  async ringNow(): Promise<void> {
    if (this.disposed) return;
    await this.unlockSafely();
    if (!this.disposed) this.player?.ringNow();
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.listeners.clear();
    this.player?.cancelAll();
    await this.player?.close();
  }

  private async unlockSafely(): Promise<void> {
    try {
      await this.player?.unlock();
    } catch {
      // 音が出せなくてもタイマーは動かす
    }
  }

  private scheduleFrom(elapsed: number): void {
    this.player?.scheduleDelays(planStrikes(this.bells, elapsed).map((s) => s.delayMs));
  }

  private setState(next: TimerState): void {
    if (next === this.state) return;
    this.state = next;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
