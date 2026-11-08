"use client";

import { useEffect, useRef, useState } from "react";
import { imagePlacement } from "@/lib/circle-crop";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

export function CircleCropper({
  name,
  url,
  isWorking,
  onCancel,
  onConfirm,
}: {
  name: string;
  url: string;
  isWorking: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [diameter, setDiameter] = useState(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => setDiameter(frame.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const place =
    diameter > 0 && size.width > 0
      ? imagePlacement(size.width, size.height, diameter, zoom, offset.x, offset.y)
      : null;

  function remember(nextZoom: number, nextX: number, nextY: number) {
    if (!size.width || !diameter) {
      setZoom(nextZoom);
      setOffset({ x: nextX, y: nextY });
      return;
    }

    const next = imagePlacement(size.width, size.height, diameter, nextZoom, nextX, nextY);
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)));
    setOffset({
      x: next.x - (diameter - next.width) / 2,
      y: next.y - (diameter - next.height) / 2,
    });
  }

  async function confirm() {
    const image = imageRef.current;
    if (!image || !diameter || !size.width) return;

    const output = Math.min(1400, Math.max(size.width, size.height));
    const ratio = output / diameter;
    const drawn = imagePlacement(
      size.width,
      size.height,
      output,
      zoom,
      offset.x * ratio,
      offset.y * ratio,
    );
    const canvas = document.createElement("canvas");
    canvas.width = output;
    canvas.height = output;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.beginPath();
    context.arc(output / 2, output / 2, output / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(image, drawn.x, drawn.y, drawn.width, drawn.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });
    if (blob) onConfirm(blob);
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col">
      <div className="mb-6 text-center">
        <p className="truncate text-sm text-muted">{name}</p>
        <h2 className="mt-2 font-serif text-4xl tracking-tight text-ink">Crop to a circle</h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          Drag the photo. Only the circle is kept for the board.
        </p>
      </div>

      <div
        ref={frameRef}
        tabIndex={0}
        role="application"
        aria-label="Drag to position the photo inside the circle"
        className="relative aspect-square w-full touch-none overflow-hidden bg-[#e7e1d8] outline-none select-none focus-visible:ring-2 focus-visible:ring-ink"
        onPointerDown={(event) => {
          if (!place) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: offset.x,
            originY: offset.y,
          };
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          remember(
            zoom,
            active.originX + event.clientX - active.startX,
            active.originY + event.clientY - active.startY,
          );
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 24 : 8;
          if (event.key === "ArrowLeft") remember(zoom, offset.x - step, offset.y);
          else if (event.key === "ArrowRight") remember(zoom, offset.x + step, offset.y);
          else if (event.key === "ArrowUp") remember(zoom, offset.x, offset.y - step);
          else if (event.key === "ArrowDown") remember(zoom, offset.x, offset.y + step);
          else if (event.key === "+" || event.key === "=") remember(zoom + 0.08, offset.x, offset.y);
          else if (event.key === "-" || event.key === "_") remember(zoom - 0.08, offset.x, offset.y);
          else return;
          event.preventDefault();
        }}
      >
        {place ? (
          // The preview is a local blob URL, so the image optimizer cannot fetch it.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            draggable={false}
            className="absolute max-w-none opacity-40"
            style={{ left: place.x, top: place.y, width: place.width, height: place.height }}
          />
        ) : null}
        <div className="absolute inset-0 overflow-hidden rounded-full">
          {/* The preview is a local blob URL, so the image optimizer cannot fetch it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={url}
            alt="Photo positioned inside the circular crop"
            draggable={false}
            className="absolute max-w-none"
            style={
              place
                ? { left: place.x, top: place.y, width: place.width, height: place.height }
                : undefined
            }
            onLoad={(event) => {
              setSize({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-ink/30" />
      </div>

      <label className="mt-6 block">
        <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          aria-valuetext={`${Math.round(zoom * 100)} percent`}
          onChange={(event) => remember(Number(event.target.value), offset.x, offset.y)}
          className="mt-3 w-full accent-ink"
        />
      </label>

      <div className="mt-8 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => void confirm()}
          disabled={!place || isWorking}
          className="rounded-full bg-ink px-6 py-2.5 text-sm text-paper disabled:opacity-40"
        >
          {isWorking ? "Cropping" : "Use this crop"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isWorking}
          className="text-sm text-muted underline decoration-transparent underline-offset-4 hover:text-ink hover:decoration-ink disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
