import type { SoundId } from "@/lib/bells";

export interface SoundPreset {
  wave: OscillatorType;
  fundamentalHz: number;
  /** 基音に対する周波数比と相対音量 */
  partials: readonly { ratio: number; gain: number }[];
  /** 鳴り始めから最大音量までの秒数 */
  attackSeconds: number;
  /** 鳴り始めから音が消えるまでの秒数 */
  decaySeconds: number;
  peakGain: number;
}

export const SOUND_PRESETS: Record<SoundId, SoundPreset> = {
  // 高く澄んだ「チーン」。金属ベルらしい非整数倍の倍音を重ねる
  "desk-bell": {
    wave: "sine",
    fundamentalHz: 1760,
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2.0, gain: 0.35 },
      { ratio: 2.76, gain: 0.3 },
      { ratio: 5.4, gain: 0.12 },
    ],
    attackSeconds: 0.005,
    decaySeconds: 1.6,
    peakGain: 0.5,
  },
  // やわらかい「ポーン」。整数倍の弱い倍音だけにして丸い音にする
  chime: {
    wave: "sine",
    fundamentalHz: 880,
    partials: [
      { ratio: 1, gain: 1 },
      { ratio: 2, gain: 0.25 },
      { ratio: 3, gain: 0.08 },
    ],
    attackSeconds: 0.02,
    decaySeconds: 2.2,
    peakGain: 0.55,
  },
  // 低く長く響く「ゴーン」。梵鐘のような低い唸りと非整数倍の倍音を重ねる
  gong: {
    wave: "sine",
    fundamentalHz: 220,
    partials: [
      { ratio: 0.5, gain: 0.6 },
      { ratio: 1, gain: 1 },
      { ratio: 1.19, gain: 0.45 },
      { ratio: 1.5, gain: 0.35 },
      { ratio: 2.0, gain: 0.3 },
      { ratio: 2.74, gain: 0.15 },
    ],
    attackSeconds: 0.01,
    decaySeconds: 4,
    peakGain: 0.8,
  },
  // 短くはっきりした「ピッ」
  beep: {
    wave: "square",
    fundamentalHz: 1000,
    partials: [{ ratio: 1, gain: 1 }],
    attackSeconds: 0.005,
    decaySeconds: 0.2,
    peakGain: 0.2,
  },
};
