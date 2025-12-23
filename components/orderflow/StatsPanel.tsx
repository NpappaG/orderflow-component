"use client";

type StatsPanelProps = {
  buyShare: number; // 0-1
  sellShare: number; // 0-1
  windowSeconds: number;
  buyVolume?: number;
  sellVolume?: number;
  buyCount?: number;
  sellCount?: number;
};

const formatPct = (value: number) => `${(value * 100).toFixed(1)}%`;

export function StatsPanel({
  buyShare,
  sellShare,
  windowSeconds,
  buyVolume,
  sellVolume,
  buyCount,
  sellCount,
}: StatsPanelProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm shadow-lg">
      <StatTile
        label="Buys"
        value={`${formatPct(buyShare)} • ${buyVolume ? Math.round(buyVolume) : "-"} vol`}
        subvalue={buyCount !== undefined ? `${buyCount} trades` : undefined}
        accent="bg-emerald-400"
      />
      <StatTile
        label="Sells"
        value={`${formatPct(sellShare)} • ${sellVolume ? Math.round(sellVolume) : "-"} vol`}
        subvalue={sellCount !== undefined ? `${sellCount} trades` : undefined}
        accent="bg-rose-400"
      />
      <StatTile
        label="Lookback Time"
        value={`${windowSeconds}s`}
        accent="bg-amber-400"
      />
    </div>
  );
}

type StatTileProps = {
  label: string;
  value: string;
  subvalue?: string;
  accent: string;
};

function StatTile({ label, value, subvalue, accent }: StatTileProps) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/50">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        {label}
      </div>
      <div className="pt-1 text-lg font-semibold text-white/90">{value}</div>
      {subvalue ? <div className="text-xs text-white/60">{subvalue}</div> : null}
    </div>
  );
}
