import { describe, expect, it } from "vitest";
import { silentWav } from "./keep-alive";

function ascii(view: DataView, offset: number, length: number): string {
  return String.fromCharCode(...Array.from({ length }, (_, i) => view.getUint8(offset + i)));
}

describe("silentWav", () => {
  it("指定した長さの無音の WAV（16bit モノラル PCM）を作る", () => {
    const view = new DataView(silentWav(0.5, 8000));
    expect(view.byteLength).toBe(44 + 8000);
    expect(ascii(view, 0, 4)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(view.byteLength - 8);
    expect(ascii(view, 8, 8)).toBe("WAVEfmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8000);
    expect(view.getUint32(28, true)).toBe(16000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(view, 36, 4)).toBe("data");
    expect(view.getUint32(40, true)).toBe(8000);
    expect(new Uint8Array(view.buffer, 44).every((b) => b === 0)).toBe(true);
  });
});
