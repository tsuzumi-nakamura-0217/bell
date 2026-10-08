/**
 * 無音をループ再生する audio 要素。
 *
 * メディア要素が再生中のあいだは、iOS は画面ロック中もページを止めないので、予約したベルが鳴る。
 * Audio Session API がない古い iOS では、これが再生中だけ Web Audio も消音モードで鳴るようになる。
 */
export interface KeepAlive {
  /** iOS ではユーザー操作の中で一度呼べば、以後は操作なしで再生できる */
  play(): void;
  pause(): void;
  close(): void;
}

const SAMPLE_RATE = 44100;

export function createSilentKeepAlive(): KeepAlive | null {
  if (typeof window === "undefined" || typeof window.Audio !== "function") return null;
  const url = URL.createObjectURL(new Blob([silentWav(1, SAMPLE_RATE)], { type: "audio/wav" }));
  const audio = new window.Audio(url);
  audio.loop = true;

  return {
    play() {
      // 再生を許可されなかった場合も、ベル自体は Web Audio で鳴らす
      if (audio.paused) audio.play().catch(() => {});
    },
    pause() {
      if (!audio.paused) audio.pause();
    },
    close() {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    },
  };
}

/** 無音の WAV（16bit モノラル PCM） */
export function silentWav(seconds: number, sampleRate: number): ArrayBuffer {
  const dataBytes = Math.round(seconds * sampleRate) * 2;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt チャンクの長さ
  view.setUint16(20, 1, true); // リニア PCM
  view.setUint16(22, 1, true); // モノラル
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // 1秒あたりのバイト数
  view.setUint16(32, 2, true); // 1サンプルのバイト数
  view.setUint16(34, 16, true); // ビット深度
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return view.buffer;
}
