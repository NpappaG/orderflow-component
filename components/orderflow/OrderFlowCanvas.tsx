"use client";

import { useEffect, useRef } from "react";
import { useOrderStream } from "@/lib/orderflow/useSyntheticOrderStream";
import { OrderEvent, OrderflowStats, OrderSide } from "@/lib/orderflow/types";

type OrderFlowCanvasProps = {
  label?: string;
  streaming?: boolean;
  windowSeconds: number;
  onStatsChange?: (stats: OrderflowStats) => void;
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
const maxOrderBuffer = 2000;
const emaAlpha = 0.2; // smoothing for branch thickness
const ribbonSamples = 28;

type FlowGeometry = {
  origin: { x: number; y: number };
  endX: number;
  separationX: number;
  separationMax: number;
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function OrderFlowCanvas({
  label = "Synthetic stream",
  streaming = true,
  windowSeconds,
  onStatsChange,
}: OrderFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const queueRef = useRef<OrderEvent[]>([]);
  const totalsRef = useRef({ buy: 0, sell: 0 });
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
      if (queueRef.current.length > maxOrderBuffer) {
        const excess = queueRef.current.splice(
          0,
          queueRef.current.length - maxOrderBuffer
        );
        for (const dropped of excess) {
          if (dropped.side === "buy") totalsRef.current.buy -= dropped.volume;
          else totalsRef.current.sell -= dropped.volume;
        }
      }
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
  }, [windowSeconds]);

  useEffect(() => {
    statsCallbackRef.current = onStatsChange;
  }, [onStatsChange]);

  const spawnParticle = (order: OrderEvent) => {
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
  };

  const pruneWindow = () => {
    const cutoff = Date.now() - windowMsRef.current;
    const queue = queueRef.current;
    while (queue.length && queue[0].timestamp < cutoff) {
      const expired = queue.shift();
      if (!expired) break;
      if (expired.side === "buy") totalsRef.current.buy -= expired.volume;
      else totalsRef.current.sell -= expired.volume;
    }
  };

  const recomputeTotals = () => {
    const cutoff = Date.now() - windowMsRef.current;
    let buy = 0;
    let sell = 0;
    for (const o of queueRef.current) {
      if (o.timestamp >= cutoff) {
        if (o.side === "buy") buy += o.volume;
        else sell += o.volume;
      }
    }
    totalsRef.current = { buy, sell };
  };

  const updateStats = (force = false) => {
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
  };

  const resize = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    geometryRef.current = {
      origin: { x: rect.width * 0.12, y: rect.height * 0.5 },
      endX: rect.width * 0.9,
      separationX: rect.width * 0.12, // short ramp to reach full separation
      separationMax: totalFlowHeight * 0.5, // ~10% gap of total stack height
    };
  };

  const calcEdgesAt = (t: number, buyShare: number) => {
    const geom = geometryRef.current;
    if (!geom) return null;
    const { origin, endX, separationX, separationMax } = geom;
    const x = origin.x + (endX - origin.x) * t;
    const tSep = Math.max(0, Math.min(1, (x - origin.x) / separationX));
    const sep = Math.min(separationMax, easeOutCubic(tSep) * separationMax);

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
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-lg">
      <canvas ref={canvasRef} className="h-full w-full" />
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-between text-[11px] font-semibold text-white/70">
        <span className="rounded-full border border-white/15 px-2 py-[2px] backdrop-blur-sm">
          {label}
        </span>
        <span className="rounded-full border border-white/15 px-2 py-[2px] backdrop-blur-sm">
          {streaming ? "Streaming" : "Paused"}
        </span>
      </div>
    </div>
  );
}
