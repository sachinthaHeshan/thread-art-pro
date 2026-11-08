import { Studio } from "@/components/studio";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-end justify-between gap-8 border-b border-line pb-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-muted">
            Studio
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-ink sm:text-5xl">
            Thread <span className="italic">Art</span>
          </h1>
        </div>
        <p className="hidden max-w-44 text-right text-sm leading-5 text-muted sm:block">
          Crop a photo into a circle, then set the pins.
        </p>
      </header>
      <Studio />
    </div>
  );
}
