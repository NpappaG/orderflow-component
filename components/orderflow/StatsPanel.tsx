"use client";

type StatsPanelProps = {
  buyShare: number; // 0-1
  sellShare: number; // 0-1
  windowSeconds: number;
  buyVolume?: number;
  sellVolume?: number;
  buyCount?: number;
  sellCount?: number;
  className?: string;
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
  className,
}: StatsPanelProps) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-2xl border border-white/10 bg-slate-950/80 p-4 text-sm shadow-lg ${
        className ?? ""
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">
        Lookback: {windowSeconds}s
      </div>
      <StatTile
        label="Buys"
        value={`${formatPct(buyShare)} • ${buyVolume ? Math.round(buyVolume) : "-"} vol • ${
          buyCount !== undefined ? buyCount : "-"
        } trades`}
        accent="bg-emerald-400"
      />
      <StatTile
        label="Sells"
        value={`${formatPct(sellShare)} • ${sellVolume ? Math.round(sellVolume) : "-"} vol • ${
          sellCount !== undefined ? sellCount : "-"
        } trades`}
        accent="bg-rose-400"
      />
    </div>
  );
}

type StatTileProps = {
  label: string;
  value: string;
  accent: string;
};

function StatTile({ label, value, accent }: StatTileProps) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/50">
        <span className={`h-2 w-2 rounded-full ${accent}`} />
        {label}
      </div>
      <div className="pt-1 text-sm font-semibold text-white/90">{value}</div>
    </div>
  );
}
