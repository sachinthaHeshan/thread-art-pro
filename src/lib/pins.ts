export type Point = {
  x: number;
  y: number;
};

export function pinPositions(count: number, center: number, radius: number): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (Math.PI * 2 * index) / count - Math.PI / 2;

    return {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    };
  });
}
