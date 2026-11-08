import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imagePlacement } from "./circle-crop.ts";

describe("imagePlacement", () => {
  it("covers a wide photo and centers it at the closest zoom", () => {
    const place = imagePlacement(200, 100, 100, 1, 0, 0);

    assert.deepEqual(place, { x: -50, y: 0, width: 200, height: 100 });
  });

  it("stops a drag before the circle shows empty space", () => {
    const place = imagePlacement(200, 100, 100, 1, 1000, 1000);

    assert.equal(place.x, 0);
    assert.equal(place.y, 0);
  });

  it("lets a closer zoom move past the centered crop", () => {
    const place = imagePlacement(100, 100, 100, 2, 40, -10);

    assert.equal(place.width, 200);
    assert.equal(place.height, 200);
    assert.equal(place.x, -10);
    assert.equal(place.y, -60);
  });

  it("never zooms out far enough to leave a gap", () => {
    const place = imagePlacement(100, 100, 100, 0.2, 0, 0);

    assert.equal(place.width, 100);
    assert.equal(place.height, 100);
    assert.equal(place.x, 0);
    assert.equal(place.y, 0);
  });
});
