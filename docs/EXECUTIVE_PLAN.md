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

## Immediate Next Actions

- Wire the provided `useOrderStream` into the app, normalize to an `OrderEvent` shape, and feed a ref-based store for particles + rolling aggregates.
- Implement a particle pool that travels along the trunk/branch bezier paths with easing; size particles by log(volume) and retire on exit.
- Drive branch thickness from a rolling time window + EMA of buy/sell volume share, with min thickness clamps for readability.
- Hook controls: connect pause/resume to stream control; make the window slider adjust the aggregation window (optional per brief).
- Add a lightweight performance guard (cap concurrent particles, debounce resize) and ensure TypeScript/lint are clean once logic lands.

## Hyperliquid Integration Notes

- WS subscribe per symbol (`{"type":"subscribe","channel":"trades","symbol":"BTC-USD"}`) over `wss://api.hyperliquid.xyz/ws`; avoid wildcards.
- Define trade payload types and runtime-validate key fields; drop/log malformed messages. Dedup by trade id/ts to avoid repeats; keep a last-seen cursor per symbol.
- On reconnect/start, backfill recent trades via REST, merge/dedup, then resume WS to cover gaps without local persistence.
- Keep an in-memory rolling window for aggregation and branch thickness; persist only if a long-lived/historical slider is required.
- Implement heartbeat/reconnect with jittered backoff; resubscribe explicitly on reconnect.
- Offload parsing/aggregation off the WS thread to prevent backpressure; cap queue size and drop oldest non-essential items if overloaded.

### Hyperliquid WS Implementation Workplan (self-contained)

- **API contract + validation**
  - Trade shape: `{ id: string|number; symbol: string; side: "B"|"S"; price: number; size: number; ts: number; }` (align with docs; update if the feed uses different keys).
  - Runtime guardrails: validate required fields; drop + warn + increment metrics on invalid payloads; never crash the stream loop.
  - Scope to a single symbol (`BTC-USD` initially) to minimize noise; avoid wildcards.

- **Subscription + connectivity**
  - Connect to `wss://api.hyperliquid.xyz/ws`.
  - Subscribe per symbol: `{"type":"subscribe","channel":"trades","symbol":"BTC-USD"}`; if no cursor is supported, rely on backfill + dedup to cover gaps.
  - Heartbeats: detect whether server sends pings vs. requires client pings; set a timeout; on missed beats, close and reconnect with jittered backoff (1s/2s/4s… capped ~30s).
  - Resubscribe on reconnect; expose connection state to the UI (`connecting`, `live`, `reconnecting`, `error`) for user clarity.

- **Deduplication + ordering**
  - Track per-symbol `lastSeenTs` and optional `lastSeenId`; drop trades with stale ts/id.
  - For slight out-of-order arrivals, use a tiny sorted buffer (bounded) before aggregation; cap size to prevent memory creep and prefer dropping oldest beyond cap.

- **Backfill for continuity**
  - On start/reconnect, fetch recent trades via REST (per docs; include symbol + limit, and `since` if supported).
  - Merge/dedup backfill with the rolling window, then resume WS; this avoids persistence while covering downtime gaps.
  - If we ever need multi-hour/day sliders that survive reloads, add persistence (indexedDB/local cache or backend) and hydrate from storage.

- **Backpressure + processing**
  - Parse messages quickly; hand off to a processing queue off the WS thread.
  - Cap queue size (e.g., 500). When over cap, drop oldest non-essential entries and log a counter so we know it’s happening.
  - Rolling window aggregation should stay O(1): enqueue into time buckets, evict expired buckets as wall clock advances.

- **Aggregation for UI**
  - Maintain an in-memory rolling window (seconds driven by slider) to compute buy/sell volume share and counts.
  - Optional EMA smoothing on volume share; clamp minimum branch thickness for readability.
  - Expose derived stats to canvas and overlay via refs to avoid React render churn.

- **Configurability + hygiene**
  - Centralize tunables: `SYMBOL`, `BACKFILL_LIMIT`, `QUEUE_CAP`, `HEARTBEAT_MS`, `BACKOFF_MAX_MS`, `WINDOW_SECONDS`, `EMA_ALPHA`.
  - Clean teardown on unmount: close socket, clear timers, drain queues, reset refs.
  - Error handling: JSON parse guards, unexpected `type` handling, and surfacing connection errors to UI state.

- **Dependencies**
  - Subscription depends on validated trade shape and symbol scope.
  - Dedup/backfill depend on maintaining `lastSeenTs`/`lastSeenId`.
  - Aggregation depends on rolling window + EMA config; UI depends on derived aggregates and connection state.

## Risks & Mitigations

- **FPS drops under bursty input**: Cap particle spawn, reuse pool, decouple branch thickness rendering from particle draw.
- **Jittery proportions**: Use rolling window + EMA smoothing; clamp min thickness for readability.
- **Type/lockfile drift**: Single lockfile, turbopack root pinned; keep TypeScript strict on src.

## Definition of Done

- Canvas component renders real-time flow with buy/sell split; proportions match rolling aggregation; controls are responsive and animations respect the brief (channel left→right, branch funneling, temporal slider optional).
- Stream pipeline supports pause/resume and can ingest both synthetic and live trade feeds via the same RxJS pipeline.
- Docs: README/PROBLEM alignment confirmed; architecture notes and run instructions present; warning-free dev build.
