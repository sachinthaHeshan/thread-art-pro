import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyGrayscale } from "./grayscale.ts";

describe("applyGrayscale", () => {
  it("maps a pure red pixel to its luminance and keeps alpha", () => {
    const pixels = new Uint8ClampedArray([255, 0, 0, 200]);

    applyGrayscale(pixels);

    assert.deepEqual(Array.from(pixels), [76, 76, 76, 200]);
  });

  it("leaves black and white pixels unchanged", () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);

    applyGrayscale(pixels);

    assert.deepEqual(Array.from(pixels), [0, 0, 0, 255, 255, 255, 255, 255]);
  });

  it("converts each pixel independently", () => {
    const pixels = new Uint8ClampedArray([0, 255, 0, 255, 0, 0, 255, 128]);

    applyGrayscale(pixels);

    assert.deepEqual(Array.from(pixels), [150, 150, 150, 255, 29, 29, 29, 128]);
  });
});
