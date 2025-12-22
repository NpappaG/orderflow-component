"use client";

type FlowControlsProps = {
  streaming: boolean;
  onToggleStreaming: () => void;
  windowSeconds: number;
  onWindowChange: (value: number) => void;
};

export function FlowControls({
  streaming,
  onToggleStreaming,
  windowSeconds,
  onWindowChange,
}: FlowControlsProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm shadow-lg">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Stream</p>
          <p className="text-white/90">Order ingestion</p>
        </div>
        <button
          type="button"
          onClick={onToggleStreaming}
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-white/20"
        >
          {streaming ? "Pause" : "Resume"}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-white/70">
          <span>Window (temporal smoothing)</span>
          <span>{windowSeconds}s</span>
        </div>
        <input
          type="range"
          min={5}
          max={120}
          step={5}
          value={windowSeconds}
          onChange={(e) => onWindowChange(Number(e.target.value))}
          className="accent-emerald-400"
        />
      </div>
    </div>
  );
}
