"use client";

import { useState } from "react";
import { FlowControls } from "@/components/orderflow/FlowControls";
import { OrderFlowCanvas } from "@/components/orderflow/OrderFlowCanvas";
import { StatsPanel } from "@/components/orderflow/StatsPanel";
import { OrderflowStats } from "@/lib/orderflow/types";
import Link from "next/link";

const demoBuyShare = 0.58;

export default function Home() {
  const [streaming, setStreaming] = useState(true);
  const [windowSeconds, setWindowSeconds] = useState(45);
  const [separationScale, setSeparationScale] = useState(5);
  const [streamMode, setStreamMode] = useState<"synthetic" | "live">(
    "synthetic"
  );
  const [stats, setStats] = useState<OrderflowStats>({
    buyShare: demoBuyShare,
    sellShare: 1 - demoBuyShare,
    buyVolume: 0,
    sellVolume: 0,
    buyCount: 0,
    sellCount: 0,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/60">
            <span className="min-w-0 rounded-full bg-white/10 px-3 py-1 break-words">
              <Link
                href="https://github.com/NPappaG/orderflow-component"
                target="_blank"
                className="break-all text-blue-500 hover:text-blue-600"
              >
                https://github.com/NPappaG/orderflow-component
              </Link>
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Orderflow Sankey - for Hyperliquid or Synthetic Data
          </h1>
          <p className="max-w-3xl text-base text-white/70">
            Sankey-style orderflow visualization with log-scaled particles,
            rolling window + EMA smoothing. Toggle between the provided
            synthetic RxJS stream or live Hyperliquid BTC trades websocket data.
            Includes control panel for pause/lookback/separation, keeping React
            minimal while the canvas loop owns rendering.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 md:flex-row md:items-stretch">
              <div className="w-full h-[320px] md:flex-[2] md:h-[420px]">
                <OrderFlowCanvas
                  label="Orderflow lookback:"
                  streaming={streaming}
                  streamMode={streamMode}
                  windowSeconds={windowSeconds}
                  separationScale={separationScale}
                  onStatsChange={(next) => setStats(next)}
                />
              </div>
              <div className="flex w-full flex-col gap-3 md:flex-1 md:h-[420px] min-h-0">
                <StatsPanel
                  buyShare={stats.buyShare}
                  sellShare={stats.sellShare}
                  windowSeconds={windowSeconds}
                  buyVolume={stats.buyVolume}
                  sellVolume={stats.sellVolume}
                  buyCount={stats.buyCount}
                  sellCount={stats.sellCount}
                  className="flex-1 min-h-0 overflow-hidden"
                />
                <FlowControls
                  streaming={streaming}
                  onToggleStreaming={() => setStreaming((s) => !s)}
                  windowSeconds={windowSeconds}
                  onWindowChange={setWindowSeconds}
                  separationScale={separationScale}
                  onSeparationChange={setSeparationScale}
                  streamMode={streamMode}
                  onStreamModeChange={setStreamMode}
                  className="flex-1 min-h-0 overflow-auto"
                />
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                Design intent
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
                <li>
                  Stacked-origin ribbons fan out via a mid-span sigmoid, then
                  run parallel at a fixed gap (adjustable on desktop).
                </li>
                <li>
                  Percent-only pills live on the ribbons; volume/trade counts
                  live in the stats panel. Pill height is clamped to the ribbon
                  thickness; width is text-based, so alignment is approximate.
                </li>
                <li>
                  Rolling lookback slider drives an in-memory window with EMA
                  smoothing; padding/separation controls keep things readable on
                  smaller screens.
                </li>
                <li>
                  The lookback window maintains a time-ordered queue of trades;
                  old trades are culled past the cutoff, totals recalc on window
                  change, and EMA smooths the share so thickness and stats
                  update gently.
                </li>
                <li>
                  Live mode subscribes to Hyperliquid trades (`trades` channel,
                  BTC) over `wss://api.hyperliquid.xyz/ws`; sides are normalized
                  (buy/sell), notional volume is computed as size×price,
                  duplicate trade ids are dropped, and the same canvas loop
                  animates particles/log-scaled radii.
                </li>
                <li>
                  Modes & controls: Synthetic (RxJS demo) vs Live trades;
                  pause/resume; lookback slider drives the window + EMA; desktop
                  separation slider sets the gap. Pills on-canvas show only %,
                  while the stats panel carries notional volume and trade
                  counts.
                </li>
                <li>
                  Pause unsubscribes live + halts synthetic; the render loop
                  keeps going while the window ages out trades, so shares drift
                  as the buffer empties.
                </li>
                <li>
                  Mode switch (Synthetic ↔ Live) affects only new trades;
                  existing ones stay in the window until they age out, so shares
                  can briefly reflect a mix of both sources.
                </li>
                <li>
                  Window mechanics: time-ordered queue with trade-id dedupe;
                  lookback change triggers a full recalc (no historic backfill);
                  EMA smooths share; window changes do not flush the queue.
                </li>
                <li>
                  Live trade parsing: trades channel on `wss://api.hyperliquid.xyz/ws`
                  (BTC), sides normalized (`b*` = buy, else sell), notional =
                  size×price, deduped by id.
                </li>
                <li>
                  Rendering: canvas loop owns ribbons/particles; ribbons reflect
                  smoothed share with min-height clamps; particles are log-scaled by
                  volume; pills show share only; separation slider is desktop-only.
                </li>
                <li>
                  Drop rules: malformed live trades (non-numeric price/size) are
                  skipped; duplicate trade ids are deduped; the rolling window prunes
                  trades older than the lookback; particle pool caps visuals only.
                </li>
                <li>
                  Canvas is decoupled from React via refs, ready for the RxJS
                  stream from <code>docs/PROBLEM_DOC.md</code>.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
