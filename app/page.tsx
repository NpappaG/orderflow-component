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
  const [stats, setStats] = useState<OrderflowStats>({
    buyShare: demoBuyShare,
    sellShare: 1 - demoBuyShare,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/60">
            <span className="rounded-full bg-white/10 px-3 py-1">
              <Link
                href="https://github.com/NPappaG/orderflow-component"
                target="_blank"
                className="text-blue-500 hover:text-blue-600"
              >
                https://github.com/NPappaG/orderflow-component
              </Link>
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Orderflow Sankey component
          </h1>
          <p className="max-w-3xl text-base text-white/70">
            Built to plug a synthetic RxJS stream (provided in the challenge)
            and later swap in live trade feeds, keeping React renders minimal
            while a canvas loop owns animation.
          </p>
        </header>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 md:flex-row md:items-center">
              <div className="aspect-[16/9] w-full md:flex-1">
                <OrderFlowCanvas
                  label="Orderflow lookback:"
                  streaming={streaming}
                  windowSeconds={windowSeconds}
                  separationScale={separationScale}
                  onStatsChange={(next) => setStats(next)}
                />
              </div>
              <StatsPanel
                buyShare={stats.buyShare}
                sellShare={stats.sellShare}
                windowSeconds={windowSeconds}
              />
            </div>
            <div className="flex flex-col gap-4">
              <FlowControls
                streaming={streaming}
                onToggleStreaming={() => setStreaming((s) => !s)}
                windowSeconds={windowSeconds}
                onWindowChange={setWindowSeconds}
                separationScale={separationScale}
                onSeparationChange={setSeparationScale}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                Design intent
              </p>
              <p className="mt-2">
                Proportional branches and particle size encode volume. A rolling
                window (slider) smooths noise while keeping real-time feel.
                Particles originate on the left trunk, then curve into buy/sell
                exits with easing. Canvas stays decoupled from React via refs,
                ready for the RxJS hook described in{" "}
                <code>docs/PROBLEM_DOC.md</code>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
