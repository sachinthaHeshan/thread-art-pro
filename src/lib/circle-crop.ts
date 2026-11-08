export type Placement = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function imagePlacement(
  imageWidth: number,
  imageHeight: number,
  diameter: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): Placement {
  const safeZoom = Math.max(1, zoom);
  const scale = Math.max(diameter / imageWidth, diameter / imageHeight) * safeZoom;
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const maxX = Math.max(0, (width - diameter) / 2);
  const maxY = Math.max(0, (height - diameter) / 2);
  const xOffset = clamp(offsetX, -maxX, maxX);
  const yOffset = clamp(offsetY, -maxY, maxY);

  return {
    x: (diameter - width) / 2 + xOffset,
    y: (diameter - height) / 2 + yOffset,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
