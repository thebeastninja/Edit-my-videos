import type { FitMode, TextOverlay } from "./types";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

export const FONT_STACK =
  '"Inter", "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

/**
 * Draws one output frame: the source picture (fitted to the frame) plus the
 * text overlays visible at time `t`. Used by both the preview and the export,
 * so what you see is what you get.
 */
export function drawFrame(
  ctx: Ctx,
  w: number,
  h: number,
  source: FrameSource | null,
  fit: FitMode,
  texts: TextOverlay[],
  t: number,
) {
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  if (source && source.width > 0 && source.height > 0) {
    const { image, width: sw, height: sh } = source;
    const cover = Math.max(w / sw, h / sh);
    const contain = Math.min(w / sw, h / sh);

    if (fit === "fit" && Math.abs(cover - contain) > 1e-3) {
      // Blurred, zoomed copy behind the letterboxed picture.
      ctx.save();
      if ("filter" in ctx) ctx.filter = `blur(${Math.round(Math.min(w, h) * 0.04)}px) brightness(0.6)`;
      const bw = sw * cover * 1.1;
      const bh = sh * cover * 1.1;
      ctx.drawImage(image, (w - bw) / 2, (h - bh) / 2, bw, bh);
      ctx.restore();
      const dw = sw * contain;
      const dh = sh * contain;
      ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      const s = fit === "fit" ? contain : cover;
      const dw = sw * s;
      const dh = sh * s;
      ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
  }

  for (const text of texts) {
    if (t >= text.start && t < text.end) drawText(ctx, w, h, text, t);
  }
  ctx.restore();
}

function wrapLines(ctx: Ctx, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

function drawText(ctx: Ctx, w: number, h: number, o: TextOverlay, t: number) {
  const local = t - o.start;
  const remaining = o.end - t;
  const ANIM = 0.35;
  let alpha = 1;
  let scale = 1;
  let dy = 0;

  if (o.anim === "fade") {
    alpha = Math.min(1, local / ANIM, remaining / ANIM);
  } else if (o.anim === "pop") {
    const p = Math.min(1, local / ANIM);
    // Overshoot ease (back-out) for a bouncy pop.
    const c = 1.70158;
    scale = 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
    alpha = Math.min(1, remaining / 0.15);
  } else if (o.anim === "slide") {
    const p = Math.min(1, local / ANIM);
    dy = (1 - (1 - Math.pow(1 - p, 3))) * h * 0.05;
    alpha = Math.min(1, p * 1.5, remaining / ANIM);
  }
  if (alpha <= 0 || scale <= 0) return;

  const fontPx = Math.max(8, o.size * h);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = `800 ${fontPx}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines = wrapLines(ctx, o.text, w * 0.86);
  const lineH = fontPx * 1.18;
  const cx = o.x * w;
  const cy = o.y * h + dy;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  const top = -((lines.length - 1) * lineH) / 2;

  if (o.style === "box") {
    const padX = fontPx * 0.45;
    const padY = fontPx * 0.22;
    const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const bw = maxW + padX * 2;
    const bh = lines.length * lineH + padY * 2;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    roundRect(ctx, -bw / 2, top - lineH / 2 - padY, bw, bh, fontPx * 0.25);
    ctx.fill();
  }

  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (o.style === "outline") {
      ctx.lineJoin = "round";
      ctx.lineWidth = fontPx * 0.16;
      ctx.strokeStyle = "#000";
      ctx.strokeText(line, 0, y);
    } else if (o.style === "bold") {
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = fontPx * 0.25;
      ctx.shadowOffsetY = fontPx * 0.05;
    }
    ctx.fillStyle = o.color;
    ctx.fillText(line, 0, y);
    ctx.shadowColor = "transparent";
  });
  ctx.restore();
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
