import { describe, expect, it } from "vitest";
import type { Template } from "./bells";
import {
  loadSelectedId,
  pickSelectedId,
  removeFromList,
  saveSelectedId,
  SELECTED_KEY,
  upsertIntoList,
  type KeyValueStorage,
} from "./template-list";

const t = (id: string, createdAt: number, name = id): Template => ({
  id,
  name,
  bells: [{ at: 60, count: 1 }],
  sound: "desk-bell",
  createdAt,
  updatedAt: createdAt,
});

describe("pickSelectedId", () => {
  it("記憶している id が一覧にあればそれを選ぶ", () => {
    expect(pickSelectedId([t("a", 2), t("b", 1)], "b")).toBe("b");
  });

  it("記憶している id がない・一覧にないときは先頭を選ぶ", () => {
    expect(pickSelectedId([t("a", 2), t("b", 1)], null)).toBe("a");
    expect(pickSelectedId([t("a", 2), t("b", 1)], "gone")).toBe("a");
  });

  it("一覧が空なら null", () => {
    expect(pickSelectedId([], "a")).toBeNull();
  });
});

describe("upsertIntoList", () => {
  it("新しいテンプレートは作成日の新しい順の位置に入る", () => {
    expect(upsertIntoList([t("a", 3), t("b", 1)], t("c", 2)).map((x) => x.id)).toEqual(["a", "c", "b"]);
    expect(upsertIntoList([t("a", 3)], t("d", 9)).map((x) => x.id)).toEqual(["d", "a"]);
  });

  it("同じ id は置き換え、並び順は変えない", () => {
    const list = upsertIntoList([t("a", 3), t("b", 1)], { ...t("b", 1), name: "改名" });
    expect(list.map((x) => [x.id, x.name])).toEqual([
      ["a", "a"],
      ["b", "改名"],
    ]);
  });
});

describe("removeFromList", () => {
  it("指定した id だけ除く", () => {
    expect(removeFromList([t("a", 2), t("b", 1)], "a").map((x) => x.id)).toEqual(["b"]);
    expect(removeFromList([t("a", 2)], "x").map((x) => x.id)).toEqual(["a"]);
  });
});

describe("選択中の id の記憶", () => {
  function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    };
  }

  it("保存した id を読み出せる。null を保存すると消える", () => {
    const s = memoryStorage();
    saveSelectedId("abc", s);
    expect(s.data.get(SELECTED_KEY)).toBe("abc");
    expect(loadSelectedId(s)).toBe("abc");
    saveSelectedId(null, s);
    expect(loadSelectedId(s)).toBeNull();
  });

  it("storage が null や、例外を投げる場合も落ちない", () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadSelectedId(null)).toBeNull();
    expect(loadSelectedId(throwing)).toBeNull();
    expect(() => saveSelectedId("a", throwing)).not.toThrow();
    expect(() => saveSelectedId(null, throwing)).not.toThrow();
  });
});
