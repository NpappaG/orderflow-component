## Objective

Build a production-ready, real-time orderflow canvas component (Sankey-inspired) that communicates buy/sell imbalance through animated flow and rolling volume proportions, using raw canvas/p5 (no charting libs) and the provided RxJS-style stream helper. It must align with the challenge brief in `docs/PROBLEM_DOC.md` and the architecture stance in `README.md`.

## Delivery Pillars

- **Reliability**: Deterministic stream handling (RxJS), bounded memory (particle pool), smooth 60fps target with graceful degradation.
- **Clarity**: Branch thickness reflects recent volume share; particle sizing encodes order magnitude; minimal UI chrome.
- **Extensibility**: Swap synthetic stream for live trades (Hyperliquid/WebSocket) with the same pipeline; configurable windows/curves and optional time-window slider.

## Execution Plan (Principal Dev)

- **Foundations**: Clean Next/Bun baseline, resolve type/tooling warnings, lock Turbopack root. Define TypeScript types for `OrderEvent`, aggregation state, render config; ensure no charting libs are pulled in.
- **Stream & State**: Wrap the provided `useOrderStream`; add pause/resume, backpressure guard, rolling volume window + EMA for branch thickness; expose selectors via refs for the canvas loop.
- **Canvas Engine**: Bezier path definitions (main + buy/sell exits), particle pool with easing curves, branch thickness drawing decoupled from particles; favor raw canvas (p5-compatible) per brief.
- **UI Shell**: Controls for pause/resume, optional time-window slider (nice-to-have); overlay stats (buy/sell %, window). Keep React renders minimal; rely on refs to feed canvas.
- **Performance Pass**: Tune pool sizes, cap concurrent particles, profile frame time; fallbacks for low FPS; debounce resize.
- **Live Data Hook**: Adapter for Hyperliquid trades → `OrderEvent`; feature flag between synthetic and live streams; reconnect/backoff handling.
- **QA & Demos**: Smoke tests on stream operators, aggregation correctness, and pause/resume; record short demo clip; prepare knobs presets for demo vs. live-data.

## Risks & Mitigations

- **FPS drops under bursty input**: Cap particle spawn, reuse pool, decouple branch thickness rendering from particle draw.
- **Jittery proportions**: Use rolling window + EMA smoothing; clamp min thickness for readability.
- **Type/lockfile drift**: Single lockfile, turbopack root pinned; keep TypeScript strict on src.

## Definition of Done

- Canvas component renders real-time flow with buy/sell split; proportions match rolling aggregation; controls are responsive and animations respect the brief (channel left→right, branch funneling, temporal slider optional).
- Stream pipeline supports pause/resume and can ingest both synthetic and live trade feeds via the same RxJS pipeline.
- Docs: README/PROBLEM alignment confirmed; architecture notes and run instructions present; warning-free dev build.
