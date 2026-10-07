import { z } from "zod";

export const MAX_BELLS = 20;
export const MAX_AT_SECONDS = 18000;
export const MAX_COUNT = 5;

export const SOUND_IDS = ["desk-bell", "chime", "gong", "beep"] as const;
export type SoundId = (typeof SOUND_IDS)[number];
export const DEFAULT_SOUND: SoundId = "desk-bell";
export const SOUND_LABELS: Record<SoundId, string> = {
  "desk-bell": "卓上ベル",
  chime: "チャイム",
  gong: "鐘",
  beep: "電子音",
};

export function isSoundId(value: unknown): value is SoundId {
  return typeof value === "string" && (SOUND_IDS as readonly string[]).includes(value);
}

export const bellSchema = z.object({
  at: z
    .number({ error: "時刻を正しく入力してください" })
    .int({ error: "時刻を正しく入力してください" })
    .min(1, { error: "時刻は1秒以上にしてください" })
    .max(MAX_AT_SECONDS, { error: "時刻は5時間以内にしてください" }),
  count: z
    .number({ error: "回数は1〜5回です" })
    .int({ error: "回数は1〜5回です" })
    .min(1, { error: "回数は1〜5回です" })
    .max(MAX_COUNT, { error: "回数は1〜5回です" }),
});

export const templateInputSchema = z.object({
  name: z
    .string({ error: "名前を入力してください" })
    .trim()
    .min(1, { error: "名前を入力してください" })
    .max(100, { error: "名前は100文字以内にしてください" }),
  bells: z
    .array(bellSchema)
    .min(1, { error: "ベルを1つ以上設定してください" })
    .max(MAX_BELLS, { error: `ベルは${MAX_BELLS}個までです` })
    .superRefine((bells, ctx) => {
      const seen = new Set<number>();
      bells.forEach((bell, index) => {
        if (seen.has(bell.at)) {
          ctx.addIssue({ code: "custom", message: "同じ時刻のベルがあります", path: [index, "at"] });
        }
        seen.add(bell.at);
      });
    })
    .transform((bells) => [...bells].sort((a, b) => a.at - b.at)),
  sound: z.enum(SOUND_IDS, { error: "音色を選んでください" }).default(DEFAULT_SOUND),
});

export type Bell = z.output<typeof bellSchema>;
export type TemplateInput = z.output<typeof templateInputSchema>;

export interface Template extends TemplateInput {
  id: string;
  createdAt: number;
  updatedAt: number;
}
