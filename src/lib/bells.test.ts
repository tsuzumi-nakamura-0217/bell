import { describe, expect, it } from "vitest";
import { DEFAULT_SOUND, SOUND_IDS, templateInputSchema } from "./bells";

const valid = { name: "LT大会", bells: [{ at: 300, count: 2 }, { at: 240, count: 1 }] };

describe("templateInputSchema", () => {
  it("正しい入力を受け付け、ベルを時刻順に並べ替え、名前の前後の空白を除く", () => {
    const r = templateInputSchema.parse({ ...valid, name: "  LT大会  " });
    expect(r.name).toBe("LT大会");
    expect(r.bells).toEqual([{ at: 240, count: 1 }, { at: 300, count: 2 }]);
  });

  it("名前: 空白のみ・101文字は不可、100文字は可", () => {
    expect(templateInputSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, name: "あ".repeat(101) }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, name: "あ".repeat(100) }).success).toBe(true);
  });

  it("ベルの個数: 0個と21個は不可、20個は可", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ at: i + 1, count: 1 }));
    expect(templateInputSchema.safeParse({ ...valid, bells: [] }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, bells: many(21) }).success).toBe(false);
    expect(templateInputSchema.safeParse({ ...valid, bells: many(20) }).success).toBe(true);
  });

  it("at: 0・18001・小数・NaN は不可、1 と 18000 は可", () => {
    for (const at of [0, 18001, 1.5, Number.NaN]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at, count: 1 }] }).success).toBe(false);
    }
    for (const at of [1, 18000]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at, count: 1 }] }).success).toBe(true);
    }
  });

  it("count: 0 と 6 は不可、1 と 5 は可", () => {
    for (const count of [0, 6]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at: 1, count }] }).success).toBe(false);
    }
    for (const count of [1, 5]) {
      expect(templateInputSchema.safeParse({ ...valid, bells: [{ at: 1, count }] }).success).toBe(true);
    }
  });

  it("時刻の重複は不可で、2つ目の行（元の並び順）にエラーが付く", () => {
    const r = templateInputSchema.safeParse({
      ...valid,
      bells: [{ at: 60, count: 1 }, { at: 120, count: 1 }, { at: 60, count: 2 }],
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path)).toContainEqual(["bells", 2, "at"]);
  });

  it("音色: 省略すると卓上ベル、用意した音色は受け付け、知らない値は不可", () => {
    expect(templateInputSchema.parse(valid).sound).toBe(DEFAULT_SOUND);
    expect(DEFAULT_SOUND).toBe("desk-bell");
    for (const sound of SOUND_IDS) {
      expect(templateInputSchema.parse({ ...valid, sound }).sound).toBe(sound);
    }
    const r = templateInputSchema.safeParse({ ...valid, sound: "trumpet" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["sound"]);
  });
});
