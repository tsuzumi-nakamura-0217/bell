import { describe, expect, it } from "vitest";
import { generateId } from "./id";

describe("generateId", () => {
  it("[a-z0-9] の10文字を返す", () => {
    for (let i = 0; i < 200; i++) expect(generateId()).toMatch(/^[a-z0-9]{10}$/);
  });

  it("毎回異なる値を返す", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
