"use client";

import { useEffect, useRef } from "react";

type OrderFlowCanvasProps = {
  label?: string;
  streaming?: boolean;
};

const bgGradient = ["#0b1221", "#0f1e37", "#132a4c"];
const buyColor = "rgba(74, 222, 128, 0.3)"; // tailwind green-400 with alpha
const sellColor = "rgba(248, 113, 113, 0.3)"; // tailwind red-400 with alpha

export function OrderFlowCanvas({
  label = "Synthetic stream",
  streaming = true,
}: OrderFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawBackground = () => {
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, bgGradient[0]);
      gradient.addColorStop(0.5, bgGradient[1]);
      gradient.addColorStop(1, bgGradient[2]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const drawChannels = () => {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 6;
      ctx.lineCap = "round";

      // Main trunk
      ctx.beginPath();
      ctx.moveTo(40 * devicePixelRatio, canvas.height / 2);
      ctx.bezierCurveTo(
        canvas.width * 0.35,
        canvas.height * 0.45,
        canvas.width * 0.5,
        canvas.height * 0.55,
        canvas.width * 0.65,
        canvas.height * 0.5
      );
      ctx.stroke();

      // Buy branch
      ctx.strokeStyle = buyColor;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.65, canvas.height * 0.5);
      ctx.bezierCurveTo(
        canvas.width * 0.78,
        canvas.height * 0.35,
        canvas.width * 0.88,
        canvas.height * 0.2,
        canvas.width * 0.96,
        canvas.height * 0.25
      );
      ctx.stroke();

      // Sell branch
      ctx.strokeStyle = sellColor;
      ctx.beginPath();
      ctx.moveTo(canvas.width * 0.65, canvas.height * 0.5);
      ctx.bezierCurveTo(
        canvas.width * 0.78,
        canvas.height * 0.65,
        canvas.width * 0.88,
        canvas.height * 0.8,
        canvas.width * 0.96,
        canvas.height * 0.75
      );
      ctx.stroke();

      ctx.restore();
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      drawBackground();
      drawChannels();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => observer.disconnect();
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
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center text-[11px] font-medium text-white/70">
        Canvas placeholder — hook RxJS stream to animate particles and branch thickness.
      </div>
    </div>
  );
}
