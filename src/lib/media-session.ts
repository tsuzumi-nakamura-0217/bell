interface MediaSessionControls {
  title: string;
  onPlay(): void;
  onPause(): void;
}

function mediaSession(): MediaSession | null {
  return typeof navigator !== "undefined" && "mediaSession" in navigator ? navigator.mediaSession : null;
}

function setHandler(session: MediaSession, action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    session.setActionHandler(action, handler);
  } catch {
    // ブラウザが対応していない操作
  }
}

/**
 * ロック画面などに出る再生コントロールに、タイマー名を表示し、再生・一時停止をタイマーにつなぐ。
 * 未対応環境では何もしない。戻り値で元に戻す。
 */
export function bindMediaSession({ title, onPlay, onPause }: MediaSessionControls): () => void {
  const session = mediaSession();
  if (!session) return () => {};
  if (typeof MediaMetadata === "function") session.metadata = new MediaMetadata({ title, artist: "ベルタイマー" });
  setHandler(session, "play", onPlay);
  setHandler(session, "pause", onPause);
  return () => {
    setHandler(session, "play", null);
    setHandler(session, "pause", null);
    session.metadata = null;
  };
}

export function setMediaSessionPlaying(playing: boolean): void {
  const session = mediaSession();
  if (session) session.playbackState = playing ? "playing" : "paused";
}
