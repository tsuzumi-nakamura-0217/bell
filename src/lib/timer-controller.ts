import type { Bell } from "./bells";
import { planStrikes } from "./schedule";
import { initialTimer, pauseTimer, resetTimer, startTimer, type TimerState } from "./timer";

export interface StrikePlayer {
  unlock(): Promise<void>;
  scheduleDelays(delaysMs: readonly number[]): void;
  ringNow(): void;
  cancelAll(): void;
  close(): Promise<void>;
}

export class TimerController {
  private state: TimerState = initialTimer;
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
      this.player?.scheduleDelays(planStrikes(this.bells, this.state.accumulatedMs).map((s) => s.delayMs));
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

  private setState(next: TimerState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
