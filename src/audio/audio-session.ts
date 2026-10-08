/** Audio Session API（Safari 16.4 以降）。TypeScript の DOM 型にまだないので、使う分だけ宣言する */
interface AudioSessionLike {
  type: string;
}

/**
 * ページの音声を音楽プレイヤーと同じ「再生」扱いにする。未対応のブラウザでは何もしない。
 *
 * iOS Safari の Web Audio は既定では消音モードで鳴らず、画面ロック時にも止められる。
 * playback にすると消音モードでも鳴り、画面ロック中も AudioContext が止められなくなる。
 */
export function preferPlaybackAudioSession(): void {
  if (typeof navigator === "undefined") return;
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  if (session && session.type !== "playback") session.type = "playback";
}
