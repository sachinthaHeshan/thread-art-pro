"use client";

import { useEffect, useRef } from "react";
import { pinPositions } from "@/lib/pins";
import {
  BOARD_CENTER,
  BOARD_RADIUS,
  BOARD_VIEW,
  LABEL_RADIUS,
  renderBoard,
  type ThreadSegment,
} from "@/lib/thread-pattern";

export function PinBoard({
  pinCount,
  threads,
  step,
  lineCount,
}: {
  pinCount: number;
  threads: ThreadSegment[];
  step: number;
  lineCount: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shown = Math.min(Math.max(0, step), threads.length);
  const pins = pinPositions(pinCount, BOARD_CENTER, BOARD_RADIUS);
  const labels = pinPositions(pinCount, BOARD_CENTER, LABEL_RADIUS);
  const spacing = (Math.PI * 2 * BOARD_RADIUS) / pinCount;
  const dotRadius = Math.min(3.2, Math.max(1.05, spacing * 0.22));
  const fontSize = pinCount > 240 ? 4 : pinCount > 120 ? 5.5 : pinCount > 48 ? 7.5 : 11;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const size = 760;
    canvas.width = size;
    canvas.height = size;
    const pixels = renderBoard(threads.slice(0, shown), pinCount, size, lineCount);
    context.putImageData(new ImageData(pixels, size, size), 0, 0);
  }, [lineCount, pinCount, shown, threads]);

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <canvas ref={canvasRef} className="block h-auto w-full" />
      <svg
        viewBox={`0 0 ${BOARD_VIEW} ${BOARD_VIEW}`}
        role="img"
        aria-label={`White board with ${pinCount} pins and ${shown} black threads`}
        className="absolute inset-0 h-full w-full"
      >
        <circle
          cx={BOARD_CENTER}
          cy={BOARD_CENTER}
          r={BOARD_RADIUS}
          fill="none"
          stroke="#e7e1d8"
        />
        {labels.map((label, index) => (
          <text
            key={`label-${index}`}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#5f5952"
            fontSize={fontSize}
          >
            {index + 1}
          </text>
        ))}
        {pins.map((pin, index) => (
          <circle key={`pin-${index}`} cx={pin.x} cy={pin.y} r={dotRadius} fill="#171614" />
        ))}
      </svg>
    </div>
  );
}
