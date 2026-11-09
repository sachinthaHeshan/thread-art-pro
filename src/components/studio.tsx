"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCropper } from "@/components/circle-cropper";
import { PinBoard } from "@/components/pin-board";
import { useThreadArt } from "@/components/use-thread-art";
import { applyGrayscale } from "@/lib/grayscale";
import { DEFAULT_THREAD_TUNE, threadStep, type ThreadTune } from "@/lib/thread-pattern";

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

type Conversion = {
  name: string;
  originalUrl: string;
  monochromeUrl: string;
};

type PendingCrop = {
  name: string;
  url: string;
};

export function Studio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [conversion, setConversion] = useState<Conversion | null>(null);
  const [pending, setPending] = useState<PendingCrop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [pinCount, setPinCount] = useState("");
  const [lineCount, setLineCount] = useState("");
  const [tune, setTune] = useState<ThreadTune>(DEFAULT_THREAD_TUNE);

  useEffect(() => {
    if (!conversion) return;

    return () => {
      URL.revokeObjectURL(conversion.originalUrl);
      URL.revokeObjectURL(conversion.monochromeUrl);
    };
  }, [conversion]);

  useEffect(() => {
    if (!pending) return;

    return () => {
      URL.revokeObjectURL(pending.url);
    };
  }, [pending]);

  async function openCrop(file: File) {
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Choose a PNG, JPG, WEBP, or GIF.");
      return;
    }

    setError(null);
    const url = URL.createObjectURL(file);

    try {
      await loadImage(url);
      setPending({ name: file.name, url });
    } catch {
      URL.revokeObjectURL(url);
      setError("That image could not be read.");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function finishCrop(name: string, blob: Blob) {
    setError(null);
    setIsWorking(true);
    const originalUrl = URL.createObjectURL(blob);

    try {
      const monochromeUrl = await toMonochromeUrl(blob);
      setConversion({ name, originalUrl, monochromeUrl });
      setPending(null);
    } catch {
      URL.revokeObjectURL(originalUrl);
      setError("That image could not be cropped.");
    } finally {
      setIsWorking(false);
    }
  }

  function onDragEnter(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function onDragLeave(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }

  function onDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void openCrop(file);
  }

  return (
    <section
      className="relative flex flex-1 flex-col pt-8"
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        aria-label="Upload an image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void openCrop(file);
        }}
      />

      {pending ? (
        <CircleCropper
          key={pending.url}
          name={pending.name}
          url={pending.url}
          isWorking={isWorking}
          onCancel={() => setPending(null)}
          onConfirm={(blob) => void finishCrop(pending.name, blob)}
        />
      ) : conversion ? (
        <Comparison
          conversion={conversion}
          isWorking={isWorking}
          pinCount={pinCount}
          lineCount={lineCount}
          tune={tune}
          onPinCountChange={setPinCount}
          onLineCountChange={setLineCount}
          onTuneChange={setTune}
          onReplace={() => inputRef.current?.click()}
          onClear={() => {
            setConversion(null);
            setError(null);
          }}
        />
      ) : (
        <EmptyState
          isDragging={isDragging}
          isWorking={isWorking}
          onBrowse={() => inputRef.current?.click()}
        />
      )}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-[#9a3b2f]">
          {error}
        </p>
      ) : null}

      {isDragging ? (
        <div className="pointer-events-none fixed inset-0 z-10 flex items-center justify-center bg-paper/85 backdrop-blur-[2px]">
          <p className="font-serif text-4xl tracking-tight text-ink">
            Drop to crop
          </p>
        </div>
      ) : null}
    </section>
  );
}

function EmptyState({
  isDragging,
  isWorking,
  onBrowse,
}: {
  isDragging: boolean;
  isWorking: boolean;
  onBrowse: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBrowse}
      disabled={isWorking}
      className={`flex w-full flex-1 flex-col items-center justify-center rounded-[2rem] border border-dashed bg-card px-8 text-center transition ${
        isDragging ? "border-ink" : "border-[#d9d3c8] hover:border-ink"
      }`}
    >
      <span className="font-serif text-4xl tracking-tight text-ink sm:text-5xl">
        {isWorking ? "Converting" : "Drop a photograph"}
      </span>
      <span className="mt-4 max-w-sm text-sm leading-6 text-muted">
        {isWorking
          ? "Turning the image into black and white."
          : "PNG, JPG, WEBP, or GIF. You will crop it into a circle."}
      </span>
    </button>
  );
}

function Comparison({
  conversion,
  isWorking,
  pinCount,
  lineCount,
  tune,
  onPinCountChange,
  onLineCountChange,
  onTuneChange,
  onReplace,
  onClear,
}: {
  conversion: Conversion;
  isWorking: boolean;
  pinCount: string;
  lineCount: string;
  tune: ThreadTune;
  onPinCountChange: (value: string) => void;
  onLineCountChange: (value: string) => void;
  onTuneChange: (tune: ThreadTune) => void;
  onReplace: () => void;
  onClear: () => void;
}) {
  const pins = readCount(pinCount, 3, 1000);
  const lines = readCount(lineCount, 1, 20000);
  const threadArt = useThreadArt(conversion.monochromeUrl, pins, lines, tune);
  const [playback, setPlayback] = useState({ total: 0, step: 0 });
  if (lines !== null && playback.total !== lines) {
    setPlayback({ total: lines, step: lines });
  }
  const step = lines === null ? 0 : playback.total === lines ? playback.step : lines;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="min-w-0 flex-1 truncate text-sm text-muted">{conversion.name}</p>
        <div className="flex items-center gap-5 text-sm">
          <button
            type="button"
            onClick={onReplace}
            disabled={isWorking}
            className="text-ink underline decoration-[#d9d3c8] underline-offset-4 transition hover:decoration-ink disabled:opacity-40"
          >
            {isWorking ? "Converting" : "Replace"}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={isWorking}
            className="text-muted underline decoration-transparent underline-offset-4 transition hover:text-ink hover:decoration-ink disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Figure label="Original" src={conversion.originalUrl} name={conversion.name} />
        <Figure
          label="Black and white"
          src={conversion.monochromeUrl}
          name={conversion.name}
        />
      </div>

      <div className="mt-12 grid gap-8 border-t border-line pt-8 sm:grid-cols-2">
        <CountField
          id="pin-count"
          label="Pins"
          value={pinCount}
          placeholder="240"
          error={countError(pinCount, 3, 1000, "Use 3 to 1,000 pins.")}
          onChange={onPinCountChange}
        />
        <CountField
          id="line-count"
          label="Thread lines"
          value={lineCount}
          placeholder="3000"
          error={countError(lineCount, 1, 20000, "Use 1 to 20,000 lines.")}
          onChange={onLineCountChange}
        />
      </div>

      <Tune tune={tune} onChange={onTuneChange} />

      <div className="mt-10">
        {pins === null ? (
          <p className="py-16 text-center text-sm text-muted">
            Enter how many pins to place around the board.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-center text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
              {pins} pins
              {lines === null ? "" : ` · ${lines.toLocaleString("en-US")} lines`}
            </p>
            {threadArt.progress !== null && lines !== null ? (
              <p className="text-center text-sm text-muted">
                {threadArt.progress === 0
                  ? "Reading the photograph"
                  : `Placing thread ${threadArt.progress.toLocaleString("en-US")} of ${lines.toLocaleString("en-US")}`}
              </p>
            ) : null}
            <PinBoard
              pinCount={pins}
              threads={threadArt.threads}
              step={step}
              lineCount={lines ?? 0}
              weight={tune.weight}
              crossing={tune.crossing}
            />
            {lines !== null ? (
              <ThreadSteps
                step={step}
                total={lines}
                onChange={(next) => setPlayback({ total: lines, step: threadStep(next, lines) })}
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function ThreadSteps({
  step,
  total,
  onChange,
}: {
  step: number;
  total: number;
  onChange: (step: number) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Remove one thread"
          disabled={step <= 0}
          onClick={() => onChange(step - 1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none text-ink disabled:opacity-30"
        >
          −
        </button>
        <input
          type="range"
          min={0}
          max={total}
          step={1}
          value={step}
          aria-label="Thread step"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${total}`}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full accent-ink"
        />
        <button
          type="button"
          aria-label="Add one thread"
          disabled={step >= total}
          onClick={() => onChange(step + 1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-lg leading-none text-ink disabled:opacity-30"
        >
          +
        </button>
      </div>
      <p className="mt-2 text-center text-sm text-muted">
        Step {step.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </p>
    </div>
  );
}

function Tune({
  tune,
  onChange,
}: {
  tune: ThreadTune;
  onChange: (tune: ThreadTune) => void;
}) {
  return (
    <div className="mt-8 border-t border-line pt-8">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">Tune</p>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_THREAD_TUNE)}
          className="text-sm text-muted underline decoration-transparent underline-offset-4 transition hover:text-ink hover:decoration-ink"
        >
          Reset
        </button>
      </div>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <TuneSlider
          id="thread-weight"
          label="Thread weight"
          hint="How much darkness one line removes."
          min={1}
          max={80}
          step={1}
          value={tune.weight}
          display={String(tune.weight)}
          onChange={(weight) => onChange({ ...tune, weight })}
        />
        <TuneSlider
          id="minimum-span"
          label="Minimum span"
          hint="Skips pins that sit too close together."
          min={1}
          max={80}
          step={1}
          value={tune.minDistance}
          display={String(tune.minDistance)}
          onChange={(minDistance) => onChange({ ...tune, minDistance })}
        />
        <TuneSlider
          id="recent-pins"
          label="Recent pins"
          hint="Pins the thread will not return to right away."
          min={0}
          max={80}
          step={1}
          value={tune.memory}
          display={String(tune.memory)}
          onChange={(memory) => onChange({ ...tune, memory })}
        />
        <TuneSlider
          id="crossing"
          label="Crossing"
          hint="How much darker a shallow crossing becomes."
          min={0}
          max={1.5}
          step={0.05}
          value={tune.crossing}
          display={formatCrossing(tune.crossing)}
          onChange={(crossing) => onChange({ ...tune, crossing })}
        />
      </div>
    </div>
  );
}

function TuneSlider({
  id,
  label,
  hint,
  min,
  max,
  step,
  value,
  display,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
          {label}
        </label>
        <span className="font-serif text-xl tracking-tight text-ink">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-3 w-full accent-ink"
      />
      <p className="mt-2 text-sm text-muted">{hint}</p>
    </div>
  );
}

function formatCrossing(value: number) {
  return String(Math.round(value * 100) / 100);
}

function CountField({
  id,
  label,
  value,
  placeholder,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  error: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full border-b border-line bg-transparent pb-2 font-serif text-3xl tracking-tight text-ink outline-none placeholder:text-[#d3cdc4] focus:border-ink"
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[#9a3b2f]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function readCount(value: string, min: number, max: number) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < min || count > max) return null;
  return count;
}

function countError(value: string, min: number, max: number, rangeMessage: string) {
  if (value.trim() === "") return null;
  if (!/^\d+$/.test(value.trim())) return "Enter a whole number.";
  if (readCount(value, min, max) === null) return rangeMessage;
  return null;
}

function Figure({
  label,
  src,
  name,
}: {
  label: string;
  src: string;
  name: string;
}) {
  return (
    <figure className="space-y-3">
      <figcaption className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted">
        {label}
      </figcaption>
      <div className="w-fit max-w-full overflow-hidden rounded-full border border-line bg-card">
        {/* User uploads are local blob URLs, so the image optimizer cannot fetch them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${label} ${name}`}
          className="aspect-square max-h-[calc(100svh-18rem)] w-auto max-w-full object-cover"
        />
      </div>
    </figure>
  );
}

function loadImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("That image could not be read."));
    image.src = url;
  });
}

async function toMonochromeUrl(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    bitmap.close();
    throw new Error("Canvas is unavailable.");
  }

  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyGrayscale(imageData.data);
  context.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("Could not convert that image."));
    }, "image/png");
  });

  return URL.createObjectURL(blob);
}
