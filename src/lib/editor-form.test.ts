import { describe, expect, it } from "vitest";
import { templateInputSchema } from "./bells";
import { issuesToErrors, newRow, rowsToCandidate, templateToRows, type BellRow } from "./editor-form";

const row = (minutes: string, seconds: string, count = 1): BellRow => ({ key: `${minutes}:${seconds}`, minutes, seconds, count });

describe("rowsToCandidate", () => {
  it("分と秒を秒数に変換する。空欄は 0 として扱う", () => {
    expect(rowsToCandidate("x", [row("4", "30", 2), row("", "45"), row("5", "")]).bells).toEqual([
      { at: 270, count: 2 },
      { at: 45, count: 1 },
      { at: 300, count: 1 },
    ]);
  });

  it("秒が 60 以上・数字以外・負数は NaN にしてスキーマで弾かれるようにする", () => {
    for (const r of [row("1", "75"), row("a", "0"), row("1", "-5"), row("1.5", "0")]) {
      const at = rowsToCandidate("x", [r]).bells[0].at;
      expect(Number.isNaN(at)).toBe(true);
    }
  });
});

describe("templateToRows / newRow", () => {
  it("秒数を分と秒の文字列に分解する", () => {
    const rows = templateToRows([{ at: 270, count: 2 }]);
    expect(rows[0]).toMatchObject({ minutes: "4", seconds: "30", count: 2 });
  });

  it("各行の key は一意", () => {
    expect(newRow(60, 1).key).not.toBe(newRow(60, 1).key);
  });
});

describe("issuesToErrors", () => {
  it("名前・行・その他のエラーに振り分ける。同じ行は最初のメッセージを残す", () => {
    const r = templateInputSchema.safeParse(
      rowsToCandidate("   ", [row("1", "0"), row("1", "75"), row("1", "0")]),
    );
    expect(r.success).toBe(false);
    const errors = issuesToErrors(r.error!.issues);
    expect(errors.name).toBe("名前を入力してください");
    expect(errors.rows[1]).toBe("時刻を正しく入力してください");
    expect(errors.general).toBeUndefined();
  });

  it("ベルが 0 個のときは general に入る", () => {
    const r = templateInputSchema.safeParse(rowsToCandidate("x", []));
    expect(issuesToErrors(r.error!.issues).general).toBe("ベルを1つ以上設定してください");
  });
});
