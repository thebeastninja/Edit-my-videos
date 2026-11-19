"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ASPECTS } from "@/lib/types";
import { applyTemplate, type SourceItem, type TemplateDef } from "@/lib/templates";
import { emptyProject } from "@/lib/store";
import { clipAt, projectDuration } from "@/lib/timeline";
import { drawFrame } from "@/lib/render";
import { ensureFonts } from "@/lib/fonts";

/** Placeholder "clips" so every template can preview itself. */
const DEMO_ITEMS: SourceItem[] = Array.from({ length: 5 }, (_, i) => ({
  id: `demo-${i}`,
  kind: "video",
  duration: 12,
}));

const PALETTES = [
  ["#7c3aed", "#ec4899", "#fde68a"],
  ["#0ea5e9", "#22d3ee", "#f0abfc"],
  ["#f97316", "#facc15", "#7c2d12"],
  ["#10b981", "#065f46", "#a7f3d0"],
  ["#e11d48", "#1e1b4b", "#fda4af"],
];

let demoCanvas: HTMLCanvasElement | null = null;

/** Paints an abstract, moving scene for demo clip `index` at time `t`. */
function paintDemo(index: number, t: number) {
  if (!demoCanvas) {
    demoCanvas = document.createElement("canvas");
    demoCanvas.width = 360;
    demoCanvas.height = 480;
  }
  const c = demoCanvas;
  const g = c.getContext("2d")!;
  const [a, b, d] = PALETTES[index % PALETTES.length];
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, a);
  grad.addColorStop(1, b);
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // Sun / moon
  g.fillStyle = d;
  g.globalAlpha = 0.85;
  g.beginPath();
  g.arc(c.width * (0.3 + 0.4 * ((t * 0.08 + index * 0.2) % 1)), c.height * 0.35, 46, 0, Math.PI * 2);
  g.fill();
  // Rolling hills
  g.globalAlpha = 0.55;
  g.fillStyle = "#000";
  g.beginPath();
  g.moveTo(0, c.height);
  for (let x = 0; x <= c.width; x += 12) {
    g.lineTo(x, c.height * 0.68 + Math.sin(x / 40 + t * 1.4 + index) * 18);
  }
  g.lineTo(c.width, c.height);
  g.fill();
  g.globalAlpha = 1;
  return { image: c, width: c.width, height: c.height };
}

export default function TemplateCard({
  def,
  onUse,
  compact = false,
}: {
  def: TemplateDef;
  onUse: (def: TemplateDef) => void;
  compact?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);
  const project = useMemo(() => applyTemplate(def, DEMO_ITEMS, emptyProject()), [def]);
  const duration = projectDuration(project);
  const { w, h } = ASPECTS[def.aspect];
  const scale = 300 / Math.max(w, h);
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const draw = (t: number) => {
      const hit = clipAt(project.clips, t);
      const index = hit ? Number(hit.placed.clip.mediaId.split("-")[1]) : 0;
      drawFrame(
        ctx,
        el.width,
        el.height,
        {
          source: hit ? paintDemo(index, hit.sourceTime) : null,
          clip: hit?.placed.clip ?? null,
          clipTime: hit ? t - hit.placed.start : 0,
          clipLength: hit ? hit.placed.end - hit.placed.start : 0,
        },
        project,
        t,
        duration,
      );
    };

    if (!hover) {
      // A still frame where the template's title is showing.
      const still = () => draw(Math.min(1.2, duration / 2));
      still();
      ensureFonts().then(still);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw(((now - start) / 1000) % duration);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hover, project, duration]);

  return (
    <button
      type="button"
      onClick={() => onUse(def)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="group flex flex-col overflow-hidden rounded-xl bg-white/[0.04] text-left ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:ring-violet-400/70"
    >
      <div className={`flex items-center justify-center bg-black ${compact ? "h-36" : "h-64"}`}>
        <canvas ref={canvas} width={cw} height={ch} className="max-h-full max-w-full" />
      </div>
      <div className={compact ? "p-2" : "p-4"}>
        <div className="flex items-center gap-1.5">
          <span>{def.emoji}</span>
          <span className={`font-semibold text-white ${compact ? "text-xs" : "text-sm"}`}>{def.name}</span>
          <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">{def.aspect}</span>
        </div>
        {!compact && <p className="mt-1 text-xs text-white/55">{def.description}</p>}
        {!compact && (
          <span className="mt-3 inline-block rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-violet-500">
            Use template
          </span>
        )}
      </div>
    </button>
  );
}
