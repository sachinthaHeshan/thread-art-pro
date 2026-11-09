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

export type ThreadTune = {
  weight: number;
  minDistance: number;
  memory: number;
  crossing: number;
};

export const DEFAULT_THREAD_TUNE: ThreadTune = {
  weight: 20,
  minDistance: 20,
  memory: 20,
  crossing: 0.55,
};

export function threadStrength(lineCount: number, weight = DEFAULT_THREAD_TUNE.weight) {
  const amount = clamp(weight, 1, 80) / 255;
  const reference = 4000;
  if (lineCount <= reference) return amount;
  return amount * Math.sqrt(reference / Math.max(1, lineCount));
}

export function addedDarkness(
  previousAngle: number | null,
  nextAngle: number,
  strength: number,
  crossing = DEFAULT_THREAD_TUNE.crossing,
) {
  if (previousAngle === null) return strength;

  let delta = Math.abs(nextAngle - previousAngle) % Math.PI;
  if (delta > Math.PI / 2) delta = Math.PI - delta;

  return strength * (1 + clamp(crossing, 0, 2) * (1 - Math.sin(delta)));
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
  tune,
  onProgress,
  isCancelled,
}: {
  darkness: Float32Array;
  size: number;
  pinCount: number;
  lineCount: number;
  tune?: Partial<ThreadTune>;
  onProgress?: (done: number, segments: ThreadSegment[]) => void;
  isCancelled?: () => boolean;
}) {
  if (pinCount < 2 || lineCount < 1) return [];

  const settings = { ...DEFAULT_THREAD_TUNE, ...tune };
  const residual = new Float32Array(darkness);
  const strength = threadStrength(lineCount, settings.weight);
  const pins = Array.from({ length: pinCount }, (_, index) => pinPoint(index, pinCount, size));
  const cache = new Map<number, number[]>();
  const gap = minimumGap(pinCount, settings.minDistance);
  const memory = recentLimit(pinCount, settings.memory);
  const recent: number[] = [];
  const stride = pinCount * lineCount > 1_500_000 ? 2 : 1;
  const segments: ThreadSegment[] = [];
  let current = 0;

  for (let line = 0; line < lineCount; line += 1) {
    if (isCancelled?.()) return segments;

    let bestPin = selectNextPin(false);
    if (bestPin < 0) bestPin = selectNextPin(true);
    if (bestPin < 0) break;

    const pixels = pixelsFor(cache, pins, current, bestPin, pinCount, size);
    for (const pixel of pixels) residual[pixel] = Math.max(0, residual[pixel] - strength);
    segments.push({ from: current, to: bestPin });
    recent.push(bestPin);
    if (recent.length > memory) recent.shift();
    current = bestPin;

    if (onProgress && (line + 1) % 40 === 0) {
      onProgress(line + 1, segments.slice());
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return segments;

  function selectNextPin(ignoreRecent: boolean) {
    let chosen = -1;
    let chosenScore = -1;

    for (let candidate = 0; candidate < pinCount; candidate += 1) {
      if (candidate === current) continue;
      if (circularDistance(current, candidate, pinCount) <= gap) continue;
      if (!ignoreRecent && recent.includes(candidate)) continue;

      const score = lineDarkness(pixelsFor(cache, pins, current, candidate, pinCount, size), residual, stride);
      if (score > chosenScore) {
        chosenScore = score;
        chosen = candidate;
      }
    }

    return chosen;
  }
}

export function renderBoard(
  segments: ThreadSegment[],
  pinCount: number,
  size: number,
  lineCount = segments.length,
  tune?: Partial<ThreadTune>,
) {
  const settings = { ...DEFAULT_THREAD_TUNE, ...tune };
  const strength = threadStrength(lineCount, settings.weight);
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
      coverage[pixel] = Math.min(
        1,
        coverage[pixel] + addedDarkness(previous, angle, strength, settings.crossing),
      );
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

function lineDarkness(pixels: number[], residual: Float32Array, stride: number) {
  let sum = 0;
  for (let index = 0; index < pixels.length; index += stride) sum += residual[pixels[index]];
  return sum;
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

function edgeKey(from: number, to: number, pinCount: number) {
  return from * pinCount + to;
}

function circularDistance(from: number, to: number, pinCount: number) {
  const delta = Math.abs(from - to) % pinCount;
  return Math.min(delta, pinCount - delta);
}

function minimumGap(pinCount: number, minDistance: number) {
  const gap = Math.max(1, Math.round((pinCount * clamp(minDistance, 1, 120)) / 288));
  if (gap * 2 >= pinCount - 1) return Math.floor((pinCount - 1) / 3);
  return gap;
}

function recentLimit(pinCount: number, memory: number) {
  return Math.min(Math.max(0, pinCount - 2), Math.max(0, Math.round(clamp(memory, 0, 120))));
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
