import { afterEach, describe, expect, it, vi } from "vitest";
import { bindMediaSession, setMediaSessionPlaying } from "./media-session";

function fakeMediaSession() {
  const handlers = new Map<string, (() => void) | null>();
  return {
    handlers,
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, handler: (() => void) | null) => {
      handlers.set(action, handler);
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bindMediaSession", () => {
  it("タイマー名を表示し、再生・一時停止をつなぎ、解除で元に戻す", () => {
    const session = fakeMediaSession();
    vi.stubGlobal("navigator", { mediaSession: session });
    vi.stubGlobal("MediaMetadata", class {
      constructor(readonly init: MediaMetadataInit) {}
    });
    const onPlay = vi.fn();
    const onPause = vi.fn();

    const unbind = bindMediaSession({ title: "LT大会 5分", onPlay, onPause });
    expect(session.metadata).toMatchObject({ init: { title: "LT大会 5分", artist: "ベルタイマー" } });
    session.handlers.get("play")?.();
    session.handlers.get("pause")?.();
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);

    unbind();
    expect(session.handlers.get("play")).toBeNull();
    expect(session.handlers.get("pause")).toBeNull();
    expect(session.metadata).toBeNull();
  });

  it("Media Session API がなければ何もしない", () => {
    vi.stubGlobal("navigator", {});
    const unbind = bindMediaSession({ title: "x", onPlay: vi.fn(), onPause: vi.fn() });
    expect(() => unbind()).not.toThrow();
    expect(() => setMediaSessionPlaying(true)).not.toThrow();
  });
});

describe("setMediaSessionPlaying", () => {
  it("再生状態を反映する", () => {
    const session = fakeMediaSession();
    vi.stubGlobal("navigator", { mediaSession: session });
    setMediaSessionPlaying(true);
    expect(session.playbackState).toBe("playing");
    setMediaSessionPlaying(false);
    expect(session.playbackState).toBe("paused");
  });
});
