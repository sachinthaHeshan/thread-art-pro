export type ThreadSegment = {
  from: number;
  to: number;
};

export function threadStep(step: number, total: number) {
  if (total <= 0) return 0;
  const whole = Math.trunc(step);
  if (whole <= 0) return 0;
  if (whole >= total) return total;
  return whole;
}

export const BOARD_VIEW = 400;
export const BOARD_CENTER = 200;
export const BOARD_RADIUS = 142;
export const LABEL_RADIUS = 174;

export function threadStrength(lineCount: number) {
  const layers = Math.min(28, Math.max(6, Math.sqrt(Math.max(1, lineCount)) * 0.55));
  return 1 / layers;
}

export function addedDarkness(previousAngle: number | null, nextAngle: number, strength: number) {
  if (previousAngle === null) return strength;

  let delta = Math.abs(nextAngle - previousAngle) % Math.PI;
  if (delta > Math.PI / 2) delta = Math.PI - delta;

  return strength * (1 + 0.55 * (1 - Math.sin(delta)));
}

export function darknessFromPixels(pixels: Uint8ClampedArray, size: number) {
  const darkness = new Float32Array(size * size);
  const center = (size - 1) / 2;
  const radiusSquared = (size / 2) * (size / 2);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radiusSquared) continue;

      const offset = (y * size + x) * 4;
      const gray = (pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114) / 255;
      const alpha = pixels[offset + 3] / 255;
      darkness[y * size + x] = (1 - gray) * alpha;
    }
  }

  return darkness;
}

export function pinPoint(index: number, pinCount: number, size: number) {
  const center = (size - 1) / 2;
  const radius = center - 0.5;
  const angle = (Math.PI * 2 * index) / pinCount - Math.PI / 2;

  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle),
  };
}

export function linePixels(x0: number, y0: number, x1: number, y1: number, size: number) {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xEnd = Math.round(x1);
  const yEnd = Math.round(y1);
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const stepX = x < xEnd ? 1 : -1;
  const stepY = y < yEnd ? 1 : -1;
  let error = dx - dy;
  const pixels: number[] = [];
  const limit = size * 4;

  for (let step = 0; step < limit; step += 1) {
    if (x >= 0 && y >= 0 && x < size && y < size) pixels.push(y * size + x);
    if (x === xEnd && y === yEnd) break;

    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += stepX;
    }
    if (doubled < dx) {
      error += dx;
      y += stepY;
    }
  }

  return pixels;
}

export async function planThreads({
  darkness,
  size,
  pinCount,
  lineCount,
  onProgress,
  isCancelled,
}: {
  darkness: Float32Array;
  size: number;
  pinCount: number;
  lineCount: number;
  onProgress?: (done: number, segments: ThreadSegment[]) => void;
  isCancelled?: () => boolean;
}) {
  if (pinCount < 2 || lineCount < 1) return [];

  const { target, importance } = prepareTarget(darkness, size);
  const strength = threadStrength(lineCount);
  const pins = Array.from({ length: pinCount }, (_, index) => pinPoint(index, pinCount, size));
  const coverage = new Float32Array(size * size);
  const angles = new Float32Array(size * size);
  angles.fill(Number.NaN);
  const used = new Uint16Array(pinCount * pinCount);
  const visits = new Uint16Array(pinCount);
  const cache = new Map<number, number[]>();
  const gap = minimumGap(pinCount);
  const stride = pinCount * lineCount > 1_500_000 ? 2 : 1;
  const segments: ThreadSegment[] = [];
  let current = 0;
  let previous = -1;

  for (let line = 0; line < lineCount; line += 1) {
    if (isCancelled?.()) return segments;

    const selectPin = (allowReuse: boolean) => {
      let chosen = -1;
      let chosenScore = Number.NEGATIVE_INFINITY;

      for (let candidate = 0; candidate < pinCount; candidate += 1) {
        if (candidate === current || candidate === previous) continue;
        if (circularDistance(current, candidate, pinCount) <= gap) continue;

        const repeats = used[edgeKey(current, candidate, pinCount)];
        if (repeats > 0 && !allowReuse) continue;

        const score =
          scoreLine(
            pixelsFor(cache, pins, current, candidate, pinCount, size),
            target,
            coverage,
            importance,
            stride,
          ) /
          ((1 + visits[candidate] * 0.18) * (1 + repeats * 3));
        if (score > chosenScore) {
          chosenScore = score;
          chosen = candidate;
        }
      }

      return chosen;
    };

    let bestPin = selectPin(false);
    if (bestPin < 0) bestPin = selectPin(true);

    if (bestPin < 0) break;

    const pixels = pixelsFor(cache, pins, current, bestPin, pinCount, size);
    const angle = lineAngle(pins[current], pins[bestPin]);
    commitLine(pixels, angle, coverage, angles, strength);
    used[edgeKey(current, bestPin, pinCount)] += 1;
    used[edgeKey(bestPin, current, pinCount)] += 1;
    segments.push({ from: current, to: bestPin });
    visits[bestPin] += 1;
    previous = current;
    current = bestPin;

    if (onProgress && (line + 1) % 40 === 0) {
      onProgress(line + 1, segments.slice());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return segments;
}

export function renderBoard(
  segments: ThreadSegment[],
  pinCount: number,
  size: number,
  lineCount = segments.length,
) {
  const image = new Uint8ClampedArray(size * size * 4);
  image.fill(255);
  for (let index = 3; index < image.length; index += 4) image[index] = 0;

  const scale = size / BOARD_VIEW;
  const center = BOARD_CENTER * scale;
  const radius = BOARD_RADIUS * scale;
  const radiusSquared = radius * radius;
  const coverage = new Float32Array(size * size);
  const angles = new Float32Array(size * size);
  angles.fill(Number.NaN);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x + 0.5 - center;
      const dy = y + 0.5 - center;
      if (dx * dx + dy * dy <= radiusSquared) image[(y * size + x) * 4 + 3] = 255;
    }
  }

  if (pinCount < 2 || segments.length === 0) return image;

  const pins = Array.from({ length: pinCount }, (_, index) => {
    const angle = (Math.PI * 2 * index) / pinCount - Math.PI / 2;
    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  });

  for (const segment of segments) {
    const start = pins[segment.from];
    const end = pins[segment.to];
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    for (const pixel of linePixels(start.x, start.y, end.x, end.y, size)) {
      if (image[pixel * 4 + 3] === 0) continue;
      const previous = Number.isNaN(angles[pixel]) ? null : angles[pixel];
      coverage[pixel] = Math.min(1, coverage[pixel] + addedDarkness(previous, angle, threadStrength(lineCount)));
      angles[pixel] = angle;
      const shade = 255 * (1 - coverage[pixel]);
      const offset = pixel * 4;
      image[offset] = shade;
      image[offset + 1] = shade;
      image[offset + 2] = shade;
    }
  }

  return image;
}

function prepareTarget(darkness: Float32Array, size: number) {
  const center = (size - 1) / 2;
  const radiusSquared = (size / 2) * (size / 2);
  const inside: number[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy <= radiusSquared) inside.push(darkness[y * size + x]);
    }
  }

  inside.sort((left, right) => left - right);
  const low = inside[Math.floor((inside.length - 1) * 0.03)] ?? 0;
  const mid = inside[Math.floor((inside.length - 1) * 0.7)] ?? low;
  const span = Math.max(0.08, mid - low);
  const stretched = new Float32Array(darkness.length);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const value = ((darkness[y * size + x] - low) / span) * 0.45;
      stretched[y * size + x] = Math.min(1, Math.max(0, value));
    }
  }

  const blurred = boxBlur(stretched, size, Math.max(1, Math.round(size / 48)));
  const target = new Float32Array(darkness.length);
  let peakDetail = 0.001;

  for (let index = 0; index < stretched.length; index += 1) {
    peakDetail = Math.max(peakDetail, stretched[index] - blurred[index]);
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const index = y * size + x;
      const tone = stretched[index] ** 0.9;
      const edge = Math.max(0, stretched[index] - blurred[index]) / peakDetail;
      const value = tone + edge * 0.32;
      target[index] = value < 0.04 ? 0 : Math.min(1, Math.max(0, value));
    }
  }

  const gradient = new Float32Array(darkness.length);
  let peakGradient = 0.001;

  for (let y = 1; y < size - 1; y += 1) {
    for (let x = 1; x < size - 1; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const horizontal = stretched[y * size + x + 1] - stretched[y * size + x - 1];
      const vertical = stretched[(y + 1) * size + x] - stretched[(y - 1) * size + x];
      const magnitude = Math.hypot(horizontal, vertical);
      gradient[y * size + x] = magnitude;
      peakGradient = Math.max(peakGradient, magnitude);
    }
  }

  const importance = new Float32Array(darkness.length);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      if (dx * dx + dy * dy > radiusSquared) continue;
      const index = y * size + x;
      const edge = gradient[index] / peakGradient;
      importance[index] = 0.15 + 0.85 * Math.max(edge, target[index]);
    }
  }

  return { target, importance };
}

function boxBlur(source: Float32Array, size: number, radius: number) {
  const horizontal = new Float32Array(source.length);
  const result = new Float32Array(source.length);
  const center = (size - 1) / 2;
  const radiusSquared = (size / 2) * (size / 2);
  const isInside = (x: number, y: number) => {
    const dx = x - center;
    const dy = y - center;
    return dx * dx + dy * dy <= radiusSquared;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isInside(x, y)) continue;
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleX = x + offset;
        if (sampleX < 0 || sampleX >= size || !isInside(sampleX, y)) continue;
        sum += source[y * size + sampleX];
        count += 1;
      }
      horizontal[y * size + x] = count === 0 ? source[y * size + x] : sum / count;
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isInside(x, y)) continue;
      let sum = 0;
      let count = 0;
      for (let offset = -radius; offset <= radius; offset += 1) {
        const sampleY = y + offset;
        if (sampleY < 0 || sampleY >= size || !isInside(x, sampleY)) continue;
        sum += horizontal[sampleY * size + x];
        count += 1;
      }
      result[y * size + x] = count === 0 ? horizontal[y * size + x] : sum / count;
    }
  }

  return result;
}

function scoreLine(
  pixels: number[],
  target: Float32Array,
  coverage: Float32Array,
  importance: Float32Array,
  stride: number,
) {
  let darkness = 0;
  let samples = 0;

  for (let index = 0; index < pixels.length; index += stride) {
    const pixel = pixels[index];
    const remaining = target[pixel] - coverage[pixel];
    samples += 1;
    if (remaining > 0) darkness += remaining * importance[pixel];
  }

  if (samples === 0) return Number.NEGATIVE_INFINITY;
  return darkness / samples;
}

function commitLine(
  pixels: number[],
  angle: number,
  coverage: Float32Array,
  angles: Float32Array,
  strength: number,
) {
  for (const pixel of pixels) {
    const previous = Number.isNaN(angles[pixel]) ? null : angles[pixel];
    const amount = addedDarkness(previous, angle, strength);
    coverage[pixel] = Math.min(1, coverage[pixel] + amount);
    angles[pixel] = angle;
  }
}

function pixelsFor(
  cache: Map<number, number[]>,
  pins: Array<{ x: number; y: number }>,
  from: number,
  to: number,
  pinCount: number,
  size: number,
) {
  const key = edgeKey(Math.min(from, to), Math.max(from, to), pinCount);
  const cached = cache.get(key);
  if (cached) return cached;

  const pixels = linePixels(pins[from].x, pins[from].y, pins[to].x, pins[to].y, size);
  if (pinCount <= 360) cache.set(key, pixels);
  return pixels;
}

function lineAngle(from: { x: number; y: number }, to: { x: number; y: number }) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function edgeKey(from: number, to: number, pinCount: number) {
  return from * pinCount + to;
}

function circularDistance(from: number, to: number, pinCount: number) {
  const delta = Math.abs(from - to) % pinCount;
  return Math.min(delta, pinCount - delta);
}

function minimumGap(pinCount: number) {
  const gap = Math.max(1, Math.round(pinCount * 0.1));
  if (gap * 2 >= pinCount - 1) return Math.floor((pinCount - 1) / 3);
  return gap;
}
