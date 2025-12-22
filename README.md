# Sankey Orderflow Visualization

Real-time, canvas-based orderflow bifurcation inspired by Sankey diagrams. The target audience is a trading UI where we communicate **market direction and buy/sell imbalance** through proportional flow and animated order activity. Challenge brief lives in `docs/PROBLEM_DOC.md`.

---

## Problem Brief

- Visualize live order flow with a left-to-right channel that splits into buy/sell branches; thickness reflects recent volume share.
- Orders animate across the channel, then curve into the destination branch; size reflects volume.
- Real-time updates; slider-based historic window is a nice-to-have.
- No charting libs; use raw canvas (or p5). RxJS stream helper is provided.

---

## X Stack Alignment (team preference)

- Bun + TypeScript + React shell for fast HMR and small footprint.
- **RxJS** to model the live order stream (pause/resume, backpressure, fan-out to canvas + aggregations).
- Raw `<canvas>` (p5-friendly) for rendering; no charting libs.
- Tailwind v4 for light styling around controls/overlays.
- Animation loop via `requestAnimationFrame`, detached from React renders.

---

## Architecture Outline

- **React shell**: wraps controls (pause/resume, window slider) and hosts the canvas element.
- **RxJS stream**: adapts the provided hook, emits orders, supports pause/resume, and computes rolling buy/sell volume share.
- **Canvas layer**: owns the render loop, bezier curves, easing, and particle pool; reads stream state via refs to avoid re-renders.

---

## Behavior & Interactions

- **Flow model**: One source on the left that splits into Buy/Sell branches on the right. Branch thickness tracks recent executed volume share.
- **Order particles**: Each order animates through the channel, then curves into its branch. Particle radius uses a log scale on volume.
- **Temporal window**: Rolling aggregation window (slider-driven nice-to-have) smooths the buy/sell proportions without losing immediacy.
- **Sankey feel**: Start from a stacked origin where total width is conserved; buy/sell bands separate immediately and retain their proportional thickness, making imbalance legible without labels.
- **Horizontal Sankey**: Origin is a vertical pillar whose total height encodes aggregate volume; buy/sell proportions are stacked segments. As flow moves right, a translated boundary separates the segments while their heights remain the sole carrier of proportion.
- **Separation of concerns**:
  - React hosts controls + canvas container.
  - RxJS stream/hook ingests orders and exposes both particle events and rolling aggregates.
  - Canvas layer owns drawing, easing, and bezier curves; it reads the latest stream state via refs.
- **Performance**: Particle pool and capped concurrency to keep GC and CPU in check; branch thickness rendered separately from particles to stay legible.

---

## Data + Streaming Plan

- Start with the provided `useOrderStream` helper from the problem statement (BehaviorSubject/Subject-based) to synthesize realistic traffic; keep this as the default mode for demos.
- Normalize events into `OrderEvent` `{ id, side, volume, timestamp }` (extend as needed for animation state internally).
- Rolling aggregates: RxJS `scan` + time-bucketed queue to compute buy/sell volume share over the chosen window; expose a smoothed EMA for branch thickness to avoid jitter.
- Controls: pause/resume stream, tweak time window, optionally slow-mo for demos.

---

## Canvas Implementation Notes

- Precompute bezier control points for the main channel and the two exits; interpolate particle positions with easing for enter/exit.
- Maintain a small particle pool to keep GC pressure low under high-frequency streams.
- Draw order density (branch thickness) separately from particles so proportions stay readable even when few particles are on screen.
- Graceful degradation on low-powered devices: cap max concurrent particles and fall back to lower frame targets.

---

## Testing with Live Data (after basics)

- Swap the synthetic stream for Hyperliquid trades once the canvas/aggregation loop is stable. Use the `trades` WebSocket subscription documented at <https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions>; map trade events to `OrderEvent` and feed the same RxJS pipeline.
- Keep the synthetic generator as a fallback and for deterministic demo scenarios.

---

## Repo Map

- `app/page.tsx`: Orderflow experience (canvas, controls, stats).
- `components/orderflow/*`: Canvas, controls, stats UI.
- `lib/orderflow/*`: Order types, synthetic stream hook (RxJS).
- `next.config.ts`: Turbopack root pin.
- Legacy (create-next-app scaffolding): `src/*`, `build.ts` (if retained).

---

## Running Locally

```bash
# install
bun install    # or npm install

# dev with HMR
bun dev        # or npm run dev

# build
bun run build.ts
```

---

## Next Steps

- Swap synthetic stream for Hyperliquid trades via WebSocket subscription once the canvas/aggregation loop is solid.
- Add tests around the RxJS pipeline (aggregation correctness, pause/resume, backpressure under bursty input).
- Tune easing/curves and add presets for demo vs live-data modes.
