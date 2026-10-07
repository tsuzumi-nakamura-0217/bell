/** 画面スリープ防止。未対応環境や拒否された場合は何もしない。 */
export function createWakeLock() {
  let sentinel: WakeLockSentinel | null = null;
  let wanted = false;

  async function acquire(): Promise<void> {
    wanted = true;
    if (sentinel || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      if (!wanted) {
        await lock.release();
        return;
      }
      sentinel = lock;
      lock.addEventListener("release", () => {
        if (sentinel === lock) sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    wanted = false;
    const lock = sentinel;
    sentinel = null;
    try {
      await lock?.release();
    } catch {
      // すでに解放済み
    }
  }

  /** タブが再表示されたら取り直す（非表示になるとブラウザが自動で解放するため） */
  function onVisibilityChange(): void {
    if (wanted && document.visibilityState === "visible") void acquire();
  }

  return { acquire, release, onVisibilityChange };
}
