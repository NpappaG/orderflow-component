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

type Bezier = [number, number, number, number, number, number, number, number];

const bgGradient = ["#0b1221", "#0f1e37", "#132a4c"];
const buyColor = "rgba(74, 222, 128, 0.4)"; // tailwind green-400 with alpha
const sellColor = "rgba(248, 113, 113, 0.4)"; // tailwind red-400 with alpha
const trunkColor = "rgba(255, 255, 255, 0.2)";
const baseBranchWidth = 6;
const maxBranchWidth = 24;
const maxParticles = 400;
const maxOrderBuffer = 2000;
const emaAlpha = 0.2; // smoothing for branch thickness

const sampleBezier = (b: Bezier, t: number) => {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = b;
  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;
  const x = mt2 * mt * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t * t2 * x3;
  const y = mt2 * mt * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t * t2 * y3;
  return { x, y };
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
  const geometryRef = useRef<{
    trunk: Bezier;
    buy: Bezier;
    sell: Bezier;
  } | null>(null);

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
      particlesRef.current.splice(0, particlesRef.current.length - maxParticles);
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
      trunk: [
        40,
        rect.height / 2,
        rect.width * 0.35,
        rect.height * 0.45,
        rect.width * 0.5,
        rect.height * 0.55,
        rect.width * 0.65,
        rect.height * 0.5,
      ],
      buy: [
        rect.width * 0.65,
        rect.height * 0.5,
        rect.width * 0.78,
        rect.height * 0.35,
        rect.width * 0.88,
        rect.height * 0.2,
        rect.width * 0.96,
        rect.height * 0.25,
      ],
      sell: [
        rect.width * 0.65,
        rect.height * 0.5,
        rect.width * 0.78,
        rect.height * 0.65,
        rect.width * 0.88,
        rect.height * 0.8,
        rect.width * 0.96,
        rect.height * 0.75,
      ],
    };
  };

  const drawFrame = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const geom = geometryRef.current;
    if (!canvas || !ctx || !geom) return;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, bgGradient[0]);
    gradient.addColorStop(0.5, bgGradient[1]);
    gradient.addColorStop(1, bgGradient[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Branch thickness based on share
    const { buyShare, sellShare } = statsRef.current;
    const buyWidth = baseBranchWidth + buyShare * maxBranchWidth;
    const sellWidth = baseBranchWidth + sellShare * maxBranchWidth;

    // Trunk
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = trunkColor;
    ctx.lineWidth = baseBranchWidth;
    ctx.beginPath();
    ctx.moveTo(geom.trunk[0], geom.trunk[1]);
    ctx.bezierCurveTo(
      geom.trunk[2],
      geom.trunk[3],
      geom.trunk[4],
      geom.trunk[5],
      geom.trunk[6],
      geom.trunk[7]
    );
    ctx.stroke();

    // Buy branch
    ctx.strokeStyle = buyColor;
    ctx.lineWidth = buyWidth;
    ctx.beginPath();
    ctx.moveTo(geom.buy[0], geom.buy[1]);
    ctx.bezierCurveTo(
      geom.buy[2],
      geom.buy[3],
      geom.buy[4],
      geom.buy[5],
      geom.buy[6],
      geom.buy[7]
    );
    ctx.stroke();

    // Sell branch
    ctx.strokeStyle = sellColor;
    ctx.lineWidth = sellWidth;
    ctx.beginPath();
    ctx.moveTo(geom.sell[0], geom.sell[1]);
    ctx.bezierCurveTo(
      geom.sell[2],
      geom.sell[3],
      geom.sell[4],
      geom.sell[5],
      geom.sell[6],
      geom.sell[7]
    );
    ctx.stroke();
    ctx.restore();

    // Particles
    const now = performance.now();
    const active: Particle[] = [];
    for (const p of particlesRef.current) {
      const t = Math.min(1, (now - p.birth) / p.duration);
      const eased = easeOutCubic(t);
      const pathSplit = 0.62;
      let point;
      if (eased < pathSplit) {
        const localT = eased / pathSplit;
        point = sampleBezier(geom.trunk, localT);
      } else {
        const localT = (eased - pathSplit) / (1 - pathSplit);
        const branch = p.side === "buy" ? geom.buy : geom.sell;
        point = sampleBezier(branch, localT);
      }

      const alpha = 1 - t;
      ctx.beginPath();
      ctx.fillStyle =
        p.side === "buy"
          ? `rgba(74, 222, 128, ${0.6 * alpha})`
          : `rgba(248, 113, 113, ${0.6 * alpha})`;
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
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1 text-xs font-medium text-white/80">
        <span className="rounded-full bg-white/10 px-2 py-1 backdrop-blur">
          {label}
        </span>
        <span className="rounded-full bg-white/5 px-2 py-1 backdrop-blur">
          {streaming ? "Streaming" : "Paused"}
        </span>
      </div>
    </div>
  );
}
