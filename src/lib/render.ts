import type { Clip, ClipFilter, Project, TextOverlay } from "./types";
import { fontString } from "./fonts";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FrameSource {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/** What is on screen at one moment: the picture and the clip it belongs to. */
export interface FrameInput {
  source: FrameSource | null;
  clip: Clip | null;
  /** Seconds since the clip started on the output timeline. */
  clipTime: number;
  clipLength: number;
}

const FILTERS: Record<ClipFilter, string> = {
  none: "none",
  bw: "grayscale(1) contrast(1.15)",
  warm: "sepia(0.25) saturate(1.3) hue-rotate(-8deg) brightness(1.03)",
  cool: "saturate(1.1) hue-rotate(12deg) brightness(1.02) contrast(1.05)",
  vintage: "sepia(0.45) contrast(0.9) brightness(1.05) saturate(0.85)",
  vivid: "saturate(1.55) contrast(1.12)",
  faded: "contrast(0.82) brightness(1.1) saturate(0.75)",
};

const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3);

/** Scale and offset (as a fraction of the frame) for a clip's motion effect. */
function motionTransform(clip: Clip | null, clipTime: number, clipLength: number) {
  const p = clipLength > 0 ? Math.min(1, Math.max(0, clipTime / clipLength)) : 0;
  switch (clip?.motion) {
    case "zoomIn":
      return { s: 1 + 0.14 * p, x: 0 };
    case "zoomOut":
      return { s: 1.14 - 0.14 * p, x: 0 };
    case "panLeft":
      return { s: 1.16, x: 0.06 - 0.12 * p };
    case "panRight":
      return { s: 1.16, x: -0.06 + 0.12 * p };
    case "punch":
      return { s: 1 + 0.16 * (1 - easeOut(clipTime / 0.3)), x: 0 };
    default:
      return { s: 1, x: 0 };
  }
}

/**
 * Draws one output frame. Used by both the preview and the export, so what
 * you see is what you get.
 */
export function drawFrame(
  ctx: Ctx,
  w: number,
  h: number,
  frame: FrameInput,
  project: Project,
  t: number,
  duration: number,
) {
  const { source, clip, clipTime, clipLength } = frame;
  const ov = project.overlays ?? {};
  ctx.save();
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  if (source && source.width > 0 && source.height > 0) {
    const { image, width: sw, height: sh } = source;
    const cover = Math.max(w / sw, h / sh);
    const contain = Math.min(w / sw, h / sh);
    const m = motionTransform(clip, clipTime, clipLength);
    const filter = FILTERS[clip?.filter ?? "none"];
    const canFilter = "filter" in ctx;

    ctx.save();
    ctx.translate(w / 2 + m.x * w, h / 2);
    ctx.scale(m.s, m.s);
    if (project.fit === "fit" && Math.abs(cover - contain) > 1e-3) {
      // Blurred, zoomed copy behind the letterboxed picture. Shrinking the
      // picture to a tiny canvas and stretching it back is a cheap blur.
      const bw = sw * cover * 1.1;
      const bh = sh * cover * 1.1;
      const tiny = blurCanvas(Math.max(4, Math.round(bw / 24)), Math.max(4, Math.round(bh / 24)));
      tiny.ctx.drawImage(image, 0, 0, tiny.canvas.width, tiny.canvas.height);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tiny.canvas, -bw / 2, -bh / 2, bw, bh);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
      ctx.restore();
      if (canFilter) ctx.filter = filter;
      ctx.drawImage(image, (-sw * contain) / 2, (-sh * contain) / 2, sw * contain, sh * contain);
    } else {
      const s = project.fit === "fit" ? contain : cover;
      if (canFilter) ctx.filter = filter;
      ctx.drawImage(image, (-sw * s) / 2, (-sh * s) / 2, sw * s, sh * s);
    }
    ctx.restore();
  }

  // Clip entrance transition.
  if (clip?.transition === "fade" && clipTime < 0.45) {
    ctx.fillStyle = `rgba(0,0,0,${1 - easeOut(clipTime / 0.45)})`;
    ctx.fillRect(0, 0, w, h);
  } else if (clip?.transition === "flash" && clipTime < 0.25) {
    ctx.fillStyle = `rgba(255,255,255,${0.9 * (1 - clipTime / 0.25)})`;
    ctx.fillRect(0, 0, w, h);
  }

  if (ov.grain) drawGrain(ctx, w, h, t);
  if (ov.vignette) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (ov.letterbox) {
    // Cinema-style 2.39:1 bars; on tall frames use a fixed band instead.
    const bar = w / h > 1.2 ? Math.max(0, (h - w / 2.39) / 2) : h * 0.09;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, bar);
    ctx.fillRect(0, h - bar, w, bar);
  }

  for (const text of project.texts) {
    if (t >= text.start && t < text.end) drawText(ctx, w, h, text, t);
  }

  if (ov.progressBar && duration > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(0, 0, w, Math.max(3, h * 0.006));
    ctx.fillStyle = ov.progressBar;
    ctx.fillRect(0, 0, w * Math.min(1, t / duration), Math.max(3, h * 0.006));
  }
  if (ov.fadeOut && duration > 0) {
    const left = duration - t;
    const FADE = Math.min(0.8, duration / 4);
    if (left < FADE) {
      ctx.fillStyle = `rgba(0,0,0,${1 - left / FADE})`;
      ctx.fillRect(0, 0, w, h);
    }
  }
  ctx.restore();
}

// --- Small reusable canvas for the cheap background blur. ---
let blur: { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx } | null = null;
function blurCanvas(w: number, h: number) {
  if (!blur) {
    const canvas: OffscreenCanvas | HTMLCanvasElement =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(w, h)
        : Object.assign(document.createElement("canvas"), { width: w, height: h });
    blur = { canvas, ctx: canvas.getContext("2d") as Ctx };
  }
  if (blur.canvas.width !== w || blur.canvas.height !== h) {
    blur.canvas.width = w;
    blur.canvas.height = h;
  }
  return blur;
}

// --- Film grain: one pre-made noise tile, shifted every frame. ---
let grainTile: OffscreenCanvas | HTMLCanvasElement | null = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const size = 192;
  const c: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement("canvas"), { width: size, height: size });
  const g = c.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  let seed = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 16807) % 2147483647;
    const v = seed % 256;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function drawGrain(ctx: Ctx, w: number, h: number, t: number) {
  const tile = getGrainTile();
  const pattern = ctx.createPattern(tile, "repeat");
  if (!pattern) return;
  const frame = Math.floor(t * 24);
  const ox = (frame * 73) % 192;
  const oy = (frame * 131) % 192;
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = "overlay";
  ctx.translate(-ox, -oy);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w + 192, h + 192);
  ctx.restore();
}

// --- Text ---

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

/** Measures a text overlay's box (as fractions of the frame), for hit-testing. */
export function measureText(ctx: Ctx, w: number, h: number, o: TextOverlay) {
  const fontPx = Math.max(8, o.size * h);
  ctx.save();
  ctx.font = fontString(o.font, fontPx);
  const lines = wrapLines(ctx, o.text, w * 0.86);
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return { width: width / w, height: (lines.length * fontPx * 1.18) / h };
}

function drawText(ctx: Ctx, w: number, h: number, o: TextOverlay, t: number) {
  const local = t - o.start;
  const remaining = o.end - t;
  const ANIM = 0.35;
  let alpha = 1;
  let scale = 1;
  let dy = 0;
  let text = o.text;

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
    dy = (1 - easeOut(p)) * h * 0.05;
    alpha = Math.min(1, p * 1.5, remaining / ANIM);
  } else if (o.anim === "typewriter") {
    const chars = Array.from(o.text);
    const shown = Math.floor(local * 22); // characters per second
    text = chars.slice(0, Math.max(0, shown)).join("");
    alpha = Math.min(1, remaining / 0.2);
  }
  if (alpha <= 0 || scale <= 0 || !text.trim()) return;

  const fontPx = Math.max(8, o.size * h);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.font = fontString(o.font, fontPx);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Wrap using the full text so typewriter lines don't jump around.
  const fullLines = wrapLines(ctx, o.text, w * 0.86);
  let lines = fullLines;
  if (o.anim === "typewriter") {
    let budget = Array.from(text).length;
    lines = [];
    for (const l of fullLines) {
      if (budget <= 0) break;
      const chars = Array.from(l);
      lines.push(chars.slice(0, budget).join(""));
      budget -= chars.length + 1;
    }
  }
  const lineH = fontPx * 1.18;
  ctx.translate(o.x * w, o.y * h + dy);
  ctx.scale(scale, scale);
  const top = -((fullLines.length - 1) * lineH) / 2;

  if (o.style === "box") {
    const padX = fontPx * 0.45;
    const padY = fontPx * 0.22;
    const maxW = Math.max(...fullLines.map((l) => ctx.measureText(l).width));
    const bw = maxW + padX * 2;
    const bh = fullLines.length * lineH + padY * 2;
    ctx.fillStyle = o.bg ?? "rgba(0,0,0,0.72)";
    roundRect(ctx, -bw / 2, top - lineH / 2 - padY, bw, bh, fontPx * 0.25);
    ctx.fill();
  }

  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (o.style === "highlight") {
      // TikTok-style colored block behind each line.
      const lw = ctx.measureText(line).width + fontPx * 0.5;
      ctx.fillStyle = o.bg ?? "#facc15";
      roundRect(ctx, -lw / 2, y - lineH / 2 + fontPx * 0.04, lw, lineH - fontPx * 0.02, fontPx * 0.18);
      ctx.fill();
    } else if (o.style === "outline") {
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
