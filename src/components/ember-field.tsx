"use client";

import { useEffect, useRef } from "react";

/** Slow-rising embers behind the page. Pauses when hidden; disabled for reduced motion. */
export function EmberField({ density = 1 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const g = canvas.getContext("2d");
    if (!g) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    type P = { x: number; y: number; r: number; vy: number; vx: number; life: number; max: number; hue: number; phase: number };
    const count = Math.round(Math.min(70, (w * h) / 22000) * density);
    const spawn = (anywhere: boolean): P => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 10,
      r: 0.6 + Math.random() * 1.8,
      vy: 0.2 + Math.random() * 0.6,
      vx: (Math.random() - 0.5) * 0.2,
      life: 0,
      max: 400 + Math.random() * 600,
      hue: 15 + Math.random() * 30,
      phase: Math.random() * Math.PI * 2,
    });
    const ps = Array.from({ length: count }, () => spawn(true));

    let raf = 0;
    const tick = () => {
      g.clearRect(0, 0, w, h);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life++;
        p.y -= p.vy;
        p.x += p.vx + Math.sin((p.life + p.phase * 100) / 60) * 0.25;
        const fade = Math.min(1, p.life / 60) * Math.max(0, 1 - p.life / p.max);
        if (p.y < -10 || p.life > p.max) {
          ps[i] = spawn(false);
          continue;
        }
        const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 5);
        glow.addColorStop(0, `hsla(${p.hue + 15}, 100%, 70%, ${0.9 * fade})`);
        glow.addColorStop(0.3, `hsla(${p.hue}, 100%, 55%, ${0.35 * fade})`);
        glow.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        g.fillStyle = glow;
        g.beginPath();
        g.arc(p.x, p.y, p.r * 5, 0, Math.PI * 2);
        g.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [density]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10 h-full w-full" />;
}
