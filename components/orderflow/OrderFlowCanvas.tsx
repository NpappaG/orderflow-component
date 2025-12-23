"use client";

import { useCallback, useEffect, useRef } from "react";
import { useOrderStream } from "@/lib/orderflow/useSyntheticOrderStream";
import { OrderEvent, OrderflowStats, OrderSide } from "@/lib/orderflow/types";

type OrderFlowCanvasProps = {
  label?: string;
  streaming?: boolean;
  windowSeconds: number;
  onStatsChange?: (stats: OrderflowStats) => void;
  separationScale?: number;
};

type Particle = {
  id: string;
  side: OrderSide;
  volume: number;
  birth: number;
  duration: number;
  radius: number;
};

const bgGradient = ["#0b1221", "#0f1e37", "#132a4c"];
const buyColor = "rgba(4, 233, 38, 0.35)"; // ribbon fill
const sellColor = "rgba(248, 113, 113, 0.35)";
const particleBuyColor = "rgb(11, 247, 7)"; // brighter particles
const particleSellColor = "rgba(244, 6, 6, 0.92)"; // reuse red hue
const totalFlowHeight = 80; // combined stack height (pixels) at origin
const minBandHeight = 6;
const maxParticles = 400;
const emaAlpha = 0.2; // smoothing for branch thickness
const ribbonSamples = 80;

type FlowGeometry = {
  origin: { x: number; y: number };
  endX: number;
  separationX: number;
  separationMax: number;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const sigmoidNormalized = (t: number) => {
  const sig = (x: number) => 1 / (1 + Math.exp(-10 * (x - 0.5)));
  const s0 = sig(0);
  const s1 = sig(1);
  return (sig(t) - s0) / (s1 - s0);
};

export function OrderFlowCanvas({
  label = "Synthetic stream",
  streaming = true,
  windowSeconds,
  onStatsChange,
  separationScale = 1,
}: OrderFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const queueRef = useRef<OrderEvent[]>([]);
  const totalsRef = useRef({ buy: 0, sell: 0 });
  const countsRef = useRef({ buy: 0, sell: 0 });
  const statsRef = useRef<OrderflowStats>({ buyShare: 0.5, sellShare: 0.5 });
  const windowMsRef = useRef(windowSeconds * 1000);
  const animationRef = useRef<number | null>(null);
  const statsCallbackRef = useRef<typeof onStatsChange>(onStatsChange);
  const geometryRef = useRef<FlowGeometry | null>(null);

  const { pauseStream, resumeStream } = useOrderStream({
    enabled: streaming,
    onOrderReceived: (order) => {
      queueRef.current.push(order);
      if (order.side === "buy") totalsRef.current.buy += order.volume;
      else totalsRef.current.sell += order.volume;
      if (order.side === "buy") countsRef.current.buy += 1;
      else countsRef.current.sell += 1;
      totalsRef.current.buy = Math.max(0, totalsRef.current.buy);
      totalsRef.current.sell = Math.max(0, totalsRef.current.sell);
      spawnParticle(order);
      updateStats();
    },
  });

  useEffect(() => {
    if (streaming) resumeStream();
    else pauseStream();
  }, [pauseStream, resumeStream, streaming]);

  useEffect(() => {
    windowMsRef.current = windowSeconds * 1000;
    // Resync aggregates when window changes
    recomputeTotals();
    updateStats(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSeconds]);

  useEffect(() => {
    statsCallbackRef.current = onStatsChange;
  }, [onStatsChange]);

  function spawnParticle(order: OrderEvent) {
    const radius = Math.max(2, Math.log(order.volume + 1) * 1.2);
    const duration = 1400 + Math.random() * 800;
    particlesRef.current.push({
      id: order.id,
      side: order.side,
      volume: order.volume,
      birth: performance.now(),
      duration,
      radius,
    });
    if (particlesRef.current.length > maxParticles) {
      particlesRef.current.splice(
        0,
        particlesRef.current.length - maxParticles
      );
    }
  }

  function pruneWindow() {
    const cutoff = Date.now() - windowMsRef.current;
    const queue = queueRef.current;
    while (queue.length && queue[0].timestamp < cutoff) {
      const expired = queue.shift();
      if (!expired) break;
      if (expired.side === "buy") totalsRef.current.buy -= expired.volume;
      else totalsRef.current.sell -= expired.volume;
      totalsRef.current.buy = Math.max(0, totalsRef.current.buy);
      totalsRef.current.sell = Math.max(0, totalsRef.current.sell);
    }
  }

  function recomputeTotals() {
    const cutoff = Date.now() - windowMsRef.current;
    let buy = 0;
    let sell = 0;
    for (const o of queueRef.current) {
      if (o.timestamp >= cutoff) {
        if (o.side === "buy") buy += o.volume;
        else sell += o.volume;
      }
    }
    totalsRef.current = { buy: Math.max(0, buy), sell: Math.max(0, sell) };
  }

  function updateStats(force = false) {
    pruneWindow();
    const total = totalsRef.current.buy + totalsRef.current.sell;
    const rawBuy = total > 0 ? totalsRef.current.buy / total : 0.5;
    const smoothedBuy =
      emaAlpha * rawBuy + (1 - emaAlpha) * statsRef.current.buyShare;
    const buyShare = Math.min(1, Math.max(0, smoothedBuy));
    const sellShare = 1 - buyShare;
    const nextStats = { buyShare, sellShare };

    if (
      force ||
      Math.abs(nextStats.buyShare - statsRef.current.buyShare) > 0.001 ||
      Math.abs(nextStats.sellShare - statsRef.current.sellShare) > 0.001
    ) {
      statsRef.current = nextStats;
      statsCallbackRef.current?.(nextStats);
    }
  }

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    const cssWidth = rect.width;
    const isMobile = cssWidth < 640;
    const leftPad = cssWidth * (isMobile ? 0.06 : 0.08);
    const rightPad = cssWidth * (isMobile ? 0.30 : 0.32); // reserve space for chips, pull end left
    const originX = leftPad;
    const endX = Math.max(originX + 120, cssWidth - rightPad);
    const span = endX - originX;
    const baseSeparation = Math.max(8, totalFlowHeight * 0.14); // pixels
    const separationMax = baseSeparation * separationScale;

    geometryRef.current = {
      origin: { x: originX, y: rect.height * 0.5 },
      endX,
      separationX: span * 0.2, // short ramp to reach full separation
      separationMax,
    };
  }, [separationScale]);

  const calcEdgesAt = (t: number, buyShare: number) => {
    const geom = geometryRef.current;
    if (!geom) return null;
    const { origin, endX, separationMax } = geom;
    const x = origin.x + (endX - origin.x) * t;
    // Piecewise: 0-0.25 glued, 0.25-0.75 sigmoid fan-out, 0.75-1 constant separation
    let sep = 0;
    if (t >= 0.25 && t <= 0.75) {
      const localT = (t - 0.25) / 0.5; // 0..1 over middle span
      const eased = sigmoidNormalized(localT);
      sep = eased * separationMax;
    } else if (t > 0.75) {
      sep = separationMax;
    }

    const hBuy = Math.max(minBandHeight, totalFlowHeight * buyShare);
    const hSell = Math.max(minBandHeight, totalFlowHeight - hBuy);
    // Keep heights constant; separate by translating centers symmetrically with a gap
    const yMid = origin.y;
    const buyCenter = yMid - hSell / 2 - sep / 2;
    const sellCenter = yMid + hBuy / 2 + sep / 2;

    const buyTop = buyCenter - hBuy / 2;
    const buyBot = buyCenter + hBuy / 2;
    const sellTop = sellCenter - hSell / 2;
    const sellBot = sellCenter + hSell / 2;

    return { x, buyTop, buyBot, sellTop, sellBot, buyCenter, sellCenter };
  };

  const drawRibbons = (ctx: CanvasRenderingContext2D) => {
    const geom = geometryRef.current;
    if (!geom) return;
    const { buyShare } = statsRef.current;

    const buyTopPts: { x: number; y: number }[] = [];
    const buyBotPts: { x: number; y: number }[] = [];
    const sellTopPts: { x: number; y: number }[] = [];
    const sellBotPts: { x: number; y: number }[] = [];

    for (let i = 0; i <= ribbonSamples; i++) {
      const t = i / ribbonSamples;
      const edges = calcEdgesAt(t, buyShare);
      if (!edges) continue;
      buyTopPts.push({ x: edges.x, y: edges.buyTop });
      buyBotPts.push({ x: edges.x, y: edges.buyBot });
      sellTopPts.push({ x: edges.x, y: edges.sellTop });
      sellBotPts.push({ x: edges.x, y: edges.sellBot });
    }

    // Buy ribbon
    ctx.beginPath();
    buyTopPts.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    for (let i = buyBotPts.length - 1; i >= 0; i--) {
      const p = buyBotPts[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = buyColor;
    ctx.fill();

    // Sell ribbon
    ctx.beginPath();
    sellTopPts.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    for (let i = sellBotPts.length - 1; i >= 0; i--) {
      const p = sellBotPts[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = sellColor;
    ctx.fill();

    // Overlay stats chips near ribbons
    const tipSample = calcEdgesAt(1, buyShare);
    if (tipSample) {
      const formatter = new Intl.NumberFormat(undefined, {
        style: "percent",
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
      const buyPct = formatter.format(buyShare);
      const sellPct = formatter.format(1 - buyShare);
      const buyVol = totalsRef.current.buy;
      const sellVol = totalsRef.current.sell;
      const buyCount = countsRef.current.buy;
      const sellCount = countsRef.current.sell;

      const padX = 8;
      const isMobile = ctx.canvas.width / (window.devicePixelRatio || 1) < 640;
      const headlineSize = isMobile ? 12 : 14;
      const subSize = isMobile ? 11 : 12;
      const clamp = (v: number, min: number, max: number) =>
        Math.max(min, Math.min(max, v));

      const drawChip = (
        x: number,
        y: number,
        text: string,
        subtext: string,
        color: string
      ) => {
        const thickness =
          color === "rgba(74, 222, 128, 0.8)"
            ? tipSample.buyBot - tipSample.buyTop
            : tipSample.sellBot - tipSample.sellTop;
        const h = clamp(thickness, 18, 60);
        ctx.save();
        ctx.font = `${headlineSize}px 'Inter', system-ui, -apple-system`;
        const textWidth = ctx.measureText(text).width;
        ctx.font = `${subSize}px 'Inter', system-ui, -apple-system`;
        const subWidth = ctx.measureText(subtext).width;
        const w = textWidth + padX * 2 + 6; // pill only wraps the percent text
        const r = 8;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(x, y - h / 2);
        ctx.lineTo(x + w - r, y - h / 2);
        ctx.quadraticCurveTo(x + w, y - h / 2, x + w, y - h / 2 + r);
        ctx.lineTo(x + w, y + h / 2 - r);
        ctx.quadraticCurveTo(x + w, y + h / 2, x + w - r, y + h / 2);
        ctx.lineTo(x, y + h / 2);
        ctx.closePath();
        ctx.fill();
        // Percent inside pill
        ctx.globalAlpha = 1;
        ctx.font = `${headlineSize}px 'Inter', system-ui, -apple-system`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0a0a0a";
        ctx.fillText(text, x + padX + 2, y);
        // Volume outside, to the right
        ctx.font = `${subSize}px 'Inter', system-ui, -apple-system`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(subtext, x + w + 8, y);
        ctx.restore();
      };

      const buyY = tipSample.buyCenter;
      const sellY = tipSample.sellCenter;
      const cssWidth = ctx.canvas.width / (window.devicePixelRatio || 1);
      const tipX = geometryRef.current?.endX ?? tipSample.x;
      const chipX = tipX + cssWidth * 0.03;
      drawChip(
        chipX,
        buyY,
        `Buy ${buyPct}`,
        `Vol: ${Math.round(buyVol)} | Trade Ct: ${buyCount}`,
        "rgba(74, 222, 128, 0.8)"
      );
      drawChip(
        chipX,
        sellY,
        `Sell ${sellPct}`,
        `Vol: ${Math.round(sellVol)} | Trade Ct: ${sellCount}`,
        "rgba(248, 113, 113, 0.8)"
      );
    }
  };

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Background
    const gradient = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height
    );
    gradient.addColorStop(0, bgGradient[0]);
    gradient.addColorStop(0.5, bgGradient[1]);
    gradient.addColorStop(1, bgGradient[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawRibbons(ctx);

    // Particles
    const now = performance.now();
    const active: Particle[] = [];
    for (const p of particlesRef.current) {
      const t = Math.min(1, (now - p.birth) / p.duration);
      const eased = easeOutCubic(t);
      const edges = calcEdgesAt(eased, statsRef.current.buyShare);
      if (!edges) continue;
      const centerY = p.side === "buy" ? edges.buyCenter : edges.sellCenter;
      const point = { x: edges.x, y: centerY };

      const alpha = 1 - t;
      ctx.beginPath();
      ctx.fillStyle =
        p.side === "buy"
          ? particleBuyColor.replace("ALPHA", (0.6 * alpha).toFixed(3))
          : particleSellColor.replace("ALPHA", (0.6 * alpha).toFixed(3));
      ctx.arc(point.x, point.y, p.radius, 0, Math.PI * 2);
      ctx.fill();

      if (t < 1) active.push(p);
    }
    particlesRef.current = active;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    // Publish initial stats to UI
    statsCallbackRef.current?.(statsRef.current);

    const loop = () => {
      updateStats();
      drawFrame();
      animationRef.current = requestAnimationFrame(loop);
    };
    animationRef.current = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Recompute geometry when separation changes (desktop control)
    resize();
  }, [resize, separationScale]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-lg">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between text-[11px] font-semibold text-white/70">
        <span className="rounded-full border border-white/15 px-2 py-[2px] backdrop-blur-sm">
          {label} · {windowSeconds}s
        </span>
        <span className="rounded-full border border-white/15 px-2 py-[2px] backdrop-blur-sm">
          {streaming ? "Streaming" : "Paused"}
        </span>
      </div>
    </div>
  );
}
