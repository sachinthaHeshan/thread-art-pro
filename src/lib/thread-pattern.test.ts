import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addedDarkness,
  darknessFromPixels,
  linePixels,
  pinPoint,
  planThreads,
  renderBoard,
  threadStep,
  threadStrength,
} from "./thread-pattern.ts";

describe("addedDarkness", () => {
  it("lays a single thread at the base strength", () => {
    assert.equal(addedDarkness(null, 0, 0.2), 0.2);
  });

  it("makes a shallow crossing darker than a wide crossing", () => {
    const shallow = addedDarkness(0, Math.PI / 12, 0.2);
    const wide = addedDarkness(0, Math.PI / 2, 0.2);

    assert.ok(shallow > wide);
    assert.ok(wide >= 0.2);
  });
});

describe("darknessFromPixels", () => {
  it("reads black as dark, white as light, and ignores the outside of the circle", () => {
    const size = 5;
    const pixels = new Uint8ClampedArray(size * size * 4);
    const center = 2 * size + 2;
    pixels[center * 4] = 0;
    pixels[center * 4 + 1] = 0;
    pixels[center * 4 + 2] = 0;
    pixels[center * 4 + 3] = 255;
    pixels[3] = 0;
    pixels[4] = 0;
    pixels[5] = 0;
    pixels[6] = 255;

    const darkness = darknessFromPixels(pixels, size);

    assert.equal(darkness[center], 1);
    assert.equal(darkness[0], 0);
  });
});

describe("thread detail", () => {
  it("puts more thread through dark features than through the lighter face", async () => {
    const size = 96;
    const pinCount = 80;
    const darkness = new Float32Array(size * size);
    const center = (size - 1) / 2;
    const circle = (size / 2) ** 2;
    const eyeRadius = 6 * 6;

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - center;
        const dy = y - center;
        if (dx * dx + dy * dy > circle) continue;
        const leftEye = (x - (center - 14)) ** 2 + (y - (center - 6)) ** 2 <= eyeRadius;
        const rightEye = (x - (center + 14)) ** 2 + (y - (center - 6)) ** 2 <= eyeRadius;
        const face = dx ** 2 / (26 * 26) + dy ** 2 / (32 * 32) <= 1;
        darkness[y * size + x] = leftEye || rightEye ? 1 : face ? 0.28 : 0.02;
      }
    }

    const lineCount = 220;
    const threads = await planThreads({ darkness, size, pinCount, lineCount });
    const coverage = new Float32Array(size * size);
    const angles = new Float32Array(size * size);
    angles.fill(Number.NaN);
    const strength = threadStrength(lineCount);

    for (const thread of threads) {
      const start = pinPoint(thread.from, pinCount, size);
      const end = pinPoint(thread.to, pinCount, size);
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      for (const pixel of linePixels(start.x, start.y, end.x, end.y, size)) {
        const previous = Number.isNaN(angles[pixel]) ? null : angles[pixel];
        coverage[pixel] = Math.min(1, coverage[pixel] + addedDarkness(previous, angle, strength));
        angles[pixel] = angle;
      }
    }

    const tone = (kind: "eye" | "face" | "background") => {
      let total = 0;
      let area = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const dx = x - center;
          const dy = y - center;
          if (dx * dx + dy * dy > circle) continue;
          const leftEye = (x - (center - 14)) ** 2 + (y - (center - 6)) ** 2 <= eyeRadius;
          const rightEye = (x - (center + 14)) ** 2 + (y - (center - 6)) ** 2 <= eyeRadius;
          const face = dx ** 2 / (26 * 26) + dy ** 2 / (32 * 32) <= 1;
          const region = leftEye || rightEye ? "eye" : face ? "face" : "background";
          if (region !== kind) continue;
          total += coverage[y * size + x];
          area += 1;
        }
      }
      return total / area;
    };

    const eye = tone("eye");
    const face = tone("face");
    const background = tone("background");
    assert.ok(eye > face * 1.55);
    assert.ok(face > 0.22);
    assert.ok(background < face);
  });
});

describe("threadStep", () => {
  it("keeps the shown lines inside the total", () => {
    assert.equal(threadStep(0, 10), 0);
    assert.equal(threadStep(4, 10), 4);
    assert.equal(threadStep(11, 10), 10);
    assert.equal(threadStep(-2, 10), 0);
    assert.equal(threadStep(3, 0), 0);
  });
});

describe("planThreads", () => {
  it("follows the dark chord and keeps one continuous thread", async () => {
    const size = 48;
    const pinCount = 16;
    const darkness = new Float32Array(size * size);
    const start = pinPoint(0, pinCount, size);
    const end = pinPoint(4, pinCount, size);
    for (const pixel of linePixels(start.x, start.y, end.x, end.y, size)) {
      darkness[pixel] = 1;
    }

    const threads = await planThreads({ darkness, size, pinCount, lineCount: 3 });

    assert.equal(threads.length, 3);
    assert.deepEqual(threads[0], { from: 0, to: 4 });
    assert.equal(threads[1].from, 4);
    assert.equal(threads[2].from, threads[1].to);
    for (const thread of threads) {
      assert.notEqual(thread.from, thread.to);
      assert.ok(thread.from >= 0 && thread.from < pinCount);
      assert.ok(thread.to >= 0 && thread.to < pinCount);
    }
  });

  it("does not redraw one chord into a solid bar", async () => {
    const size = 64;
    const pinCount = 36;
    const lineCount = 80;
    const center = (size - 1) / 2;
    const radius = size / 2;
    const darkness = new Float32Array(size * size);

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = x - center;
        const dy = y - center;
        if (dx * dx + dy * dy <= radius * radius) darkness[y * size + x] = 0.45;
      }
    }

    const threads = await planThreads({ darkness, size, pinCount, lineCount });
    const seen = new Set<string>();

    assert.equal(threads.length, lineCount);
    for (let index = 0; index < threads.length; index += 1) {
      const thread = threads[index];
      if (index > 0) assert.equal(thread.from, threads[index - 1].to);
      const key = `${Math.min(thread.from, thread.to)}-${Math.max(thread.from, thread.to)}`;
      assert.equal(seen.has(key), false);
      seen.add(key);
    }
  });
});

describe("renderBoard", () => {
  it("draws one thread as a hairline", () => {
    const size = 760;
    const image = renderBoard([{ from: 0, to: 2 }], 4, size, 1);
    let thickest = 0;

    for (let y = 0; y < size; y += 1) {
      let run = 0;
      for (let x = 0; x < size; x += 1) {
        if (image[(y * size + x) * 4] < 250) run += 1;
        else run = 0;
        thickest = Math.max(thickest, run);
      }
    }

    assert.equal(thickest, 1);
  });
});
