import { describe, expect, it } from "vitest";
import { formatClock } from "./time";

describe("formatClock", () => {
  it("1時間未満は m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(900)).toBe("15:00");
  });

  it("1時間以上は h:mm:ss", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("小数は切り捨て、負数は 0 として扱う", () => {
    expect(formatClock(59.9)).toBe("0:59");
    expect(formatClock(-3)).toBe("0:00");
  });
});
