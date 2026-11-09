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

  it("deepens a shallow crossing only by the requested amount", () => {
    assert.equal(addedDarkness(0, 0, 0.2, 0), 0.2);
    assert.ok(addedDarkness(0, 0, 0.2, 1) > addedDarkness(0, 0, 0.2, 0));
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

describe("threadStrength", () => {
  it("uses the requested thread weight", () => {
    assert.equal(threadStrength(100, 40), 40 / 255);
    assert.equal(threadStrength(100), 20 / 255);
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

  it("follows the chord that holds the most darkness", async () => {
    const size = 72;
    const pinCount = 24;
    const gap = Math.max(1, Math.round((pinCount * 20) / 288));
    const darkness = new Float32Array(size * size);

    for (let candidate = 1; candidate < pinCount; candidate += 1) {
      const distance = Math.min(candidate, pinCount - candidate);
      if (distance <= gap) continue;
      const start = pinPoint(0, pinCount, size);
      const end = pinPoint(candidate, pinCount, size);
      const pixels = linePixels(start.x, start.y, end.x, end.y, size);
      const tone = pixels.length > 80 ? 0.55 : 1;
      for (const pixel of pixels) darkness[pixel] = Math.max(darkness[pixel], tone);
    }

    let bestSum = -1;
    let bestTo = -1;
    for (let candidate = 1; candidate < pinCount; candidate += 1) {
      const distance = Math.min(candidate, pinCount - candidate);
      if (distance <= gap) continue;
      const start = pinPoint(0, pinCount, size);
      const end = pinPoint(candidate, pinCount, size);
      let sum = 0;
      for (const pixel of linePixels(start.x, start.y, end.x, end.y, size)) sum += darkness[pixel];
      if (sum > bestSum) {
        bestSum = sum;
        bestTo = candidate;
      }
    }

    const threads = await planThreads({ darkness, size, pinCount, lineCount: 1 });
    assert.equal(threads[0].from, 0);
    assert.equal(threads[0].to, bestTo);
  });

  it("skips a nearby pin when the minimum span is raised", async () => {
    const size = 64;
    const pinCount = 24;
    const near = 3;
    const darkness = new Float32Array(size * size);
    const start = pinPoint(0, pinCount, size);
    const end = pinPoint(near, pinCount, size);
    for (const pixel of linePixels(start.x, start.y, end.x, end.y, size)) darkness[pixel] = 1;

    const open = await planThreads({
      darkness,
      size,
      pinCount,
      lineCount: 1,
      tune: { minDistance: 1 },
    });
    const closed = await planThreads({
      darkness,
      size,
      pinCount,
      lineCount: 1,
      tune: { minDistance: 40 },
    });

    assert.equal(open[0].to, near);
    assert.notEqual(closed[0].to, near);
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
    const counts = new Map<string, number>();

    assert.equal(threads.length, lineCount);
    for (let index = 0; index < threads.length; index += 1) {
      const thread = threads[index];
      if (index > 0) assert.equal(thread.from, threads[index - 1].to);
      const key = `${Math.min(thread.from, thread.to)}-${Math.max(thread.from, thread.to)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const maxRepeat = Math.max(...counts.values());
    assert.ok(maxRepeat * threadStrength(lineCount) <= 0.45 + threadStrength(lineCount));
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
