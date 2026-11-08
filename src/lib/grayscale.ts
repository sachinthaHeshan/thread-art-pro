const RED_WEIGHT = 0.299;
const GREEN_WEIGHT = 0.587;
const BLUE_WEIGHT = 0.114;

export function applyGrayscale(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const gray = Math.round(
      pixels[index] * RED_WEIGHT +
        pixels[index + 1] * GREEN_WEIGHT +
        pixels[index + 2] * BLUE_WEIGHT,
    );

    pixels[index] = gray;
    pixels[index + 1] = gray;
    pixels[index + 2] = gray;
  }
}
