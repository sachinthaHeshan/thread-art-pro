import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pinPositions } from "./pins.ts";

describe("pinPositions", () => {
  it("places one pin at the top of the circle", () => {
    const [pin] = pinPositions(1, 100, 50);

    assert.ok(pin);
    assert.ok(Math.abs(pin.x - 100) < 1e-9);
    assert.ok(Math.abs(pin.y - 50) < 1e-9);
  });

  it("spaces four pins evenly, starting at the top", () => {
    const pins = pinPositions(4, 100, 50);

    assert.deepEqual(
      pins.map((pin) => [round(pin.x), round(pin.y)]),
      [
        [100, 50],
        [150, 100],
        [100, 150],
        [50, 100],
      ],
    );
  });

  it("returns exactly the requested number of pins on the border", () => {
    const pins = pinPositions(36, 200, 80);

    assert.equal(pins.length, 36);
    for (const pin of pins) {
      const distance = Math.hypot(pin.x - 200, pin.y - 200);
      assert.ok(Math.abs(distance - 80) < 1e-9);
    }
  });
});

function round(value: number) {
  return Math.round(value * 1e6) / 1e6;
}
