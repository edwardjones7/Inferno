"use client";

import { useEffect, useRef } from "react";

/** Soft smoke puff, painted once and stamped with drawImage (no per-frame gradients). */
function puffSprite(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  // a few overlapping blobs so the puff isn't a perfect circle
  for (const [x, y, r] of [
    [0.5, 0.5, 0.5],
    [0.38, 0.56, 0.32],
    [0.62, 0.44, 0.3],
    [0.5, 0.36, 0.26],
  ]) {
    const grad = g.createRadialGradient(x * size, y * size, 0, x * size, y * size, r * size);
    grad.addColorStop(0, "rgba(205,190,175,0.22)");
    grad.addColorStop(0.5, "rgba(190,175,160,0.08)");
    grad.addColorStop(1, "rgba(180,165,150,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  return c;
}

/**
 * The room's air behind the page: slow cigarette smoke drifting up and across, and dust
 * motes that glint when they pass under the lamp (top centre). Pauses when hidden;
 * disabled for reduced motion.
 */
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

    const sprite = puffSprite(128);

    type Puff = { x: number; y: number; s: number; vx: number; vy: number; rot: number; vr: number; life: number; max: number };
    const puffCount = Math.round(Math.min(14, (w * h) / 90000 + 4) * density);
    const spawnPuff = (anywhere: boolean): Puff => ({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : h + 80,
      s: 160 + Math.random() * 260,
      vx: (Math.random() - 0.5) * 0.12,
      vy: 0.08 + Math.random() * 0.14,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.0015,
      life: anywhere ? Math.random() * 1500 : 0,
      max: 1800 + Math.random() * 1600,
    });
    const puffs = Array.from({ length: puffCount }, () => spawnPuff(true));

    type Mote = { x: number; y: number; r: number; vx: number; vy: number; phase: number; rate: number };
    const moteCount = Math.round(Math.min(60, (w * h) / 26000) * density);
    const spawnMote = (): Mote => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.5 + Math.random() * 1.1,
      vx: (Math.random() - 0.5) * 0.08,
      vy: (Math.random() - 0.5) * 0.06,
      phase: Math.random() * Math.PI * 2,
      rate: 0.01 + Math.random() * 0.03,
    });
    const motes = Array.from({ length: moteCount }, spawnMote);

    let raf = 0;
    let frame = 0;
    const tick = () => {
      frame++;
      g.clearRect(0, 0, w, h);

      // smoke
      g.globalCompositeOperation = "source-over";
      for (let i = 0; i < puffs.length; i++) {
        const p = puffs[i];
        p.life++;
        p.y -= p.vy;
        p.x += p.vx + Math.sin((p.life + i * 300) / 400) * 0.08;
        p.rot += p.vr;
        p.s += 0.04;
        if (p.life > p.max || p.y < -p.s) {
          puffs[i] = spawnPuff(false);
          continue;
        }
        const k = p.life / p.max;
        g.globalAlpha = Math.min(1, k * 6) * (1 - k) * 0.9;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.drawImage(sprite, -p.s / 2, -p.s / 2, p.s, p.s);
        g.restore();
      }

      // dust: brighter under the lamp (top centre), a slow glint as each turns
      g.globalCompositeOperation = "lighter";
      const lx = w / 2;
      const reach = Math.max(w, h) * 0.55;
      for (const m of motes) {
        m.x += m.vx + Math.sin(frame * 0.004 + m.phase) * 0.05;
        m.y += m.vy + Math.cos(frame * 0.003 + m.phase) * 0.04;
        if (m.x < -5) m.x = w + 5;
        if (m.x > w + 5) m.x = -5;
        if (m.y < -5) m.y = h + 5;
        if (m.y > h + 5) m.y = -5;
        const lit = Math.max(0, 1 - Math.hypot(m.x - lx, m.y * 1.4) / reach);
        const glint = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(frame * m.rate + m.phase), 3);
        g.globalAlpha = (0.06 + 0.6 * lit) * glint;
        g.fillStyle = "#ffd9a8";
        g.beginPath();
        g.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
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
