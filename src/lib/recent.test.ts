import { describe, expect, it } from "vitest";
import { loadRecent, RECENT_KEY, RECENT_LIMIT, removeRecent, touchRecent, type KeyValueStorage } from "./recent";

function memoryStorage(initial?: string): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(RECENT_KEY, initial);
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("recent", () => {
  it("touchRecent で先頭に追加し、同じ id は名前と時刻を更新して重複させない", () => {
    const s = memoryStorage();
    touchRecent({ id: "a", name: "A" }, 1, s);
    touchRecent({ id: "b", name: "B" }, 2, s);
    touchRecent({ id: "a", name: "A2" }, 3, s);
    expect(loadRecent(s)).toEqual([
      { id: "a", name: "A2", lastOpenedAt: 3 },
      { id: "b", name: "B", lastOpenedAt: 2 },
    ]);
  });

  it(`最大 ${RECENT_LIMIT} 件で、古いものから落とす`, () => {
    const s = memoryStorage();
    for (let i = 0; i < RECENT_LIMIT + 5; i++) touchRecent({ id: `id${i}`, name: `n${i}` }, i, s);
    const list = loadRecent(s);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0].id).toBe(`id${RECENT_LIMIT + 4}`);
    expect(list.at(-1)?.id).toBe("id5");
  });

  it("removeRecent で指定した id だけ消す", () => {
    const s = memoryStorage();
    touchRecent({ id: "a", name: "A" }, 1, s);
    touchRecent({ id: "b", name: "B" }, 2, s);
    removeRecent("a", s);
    expect(loadRecent(s).map((e) => e.id)).toEqual(["b"]);
  });

  it("壊れたデータ・型の違う要素は無視する", () => {
    expect(loadRecent(memoryStorage("{not json"))).toEqual([]);
    expect(loadRecent(memoryStorage('{"a":1}'))).toEqual([]);
    expect(
      loadRecent(memoryStorage('[{"id":"a","name":"A","lastOpenedAt":1},{"id":2},null]')),
    ).toEqual([{ id: "a", name: "A", lastOpenedAt: 1 }]);
  });

  it("storage が null や、例外を投げる場合も落ちない", () => {
    const throwing: KeyValueStorage = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    expect(loadRecent(null)).toEqual([]);
    expect(loadRecent(throwing)).toEqual([]);
    expect(touchRecent({ id: "a", name: "A" }, 1, throwing)).toEqual([{ id: "a", name: "A", lastOpenedAt: 1 }]);
    expect(removeRecent("a", throwing)).toEqual([]);
  });
});
