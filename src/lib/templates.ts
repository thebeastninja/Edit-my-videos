import type {
  AspectRatio,
  Clip,
  ClipFilter,
  ClipMotion,
  ClipTransition,
  FitMode,
  MediaItem,
  Overlays,
  Project,
  TextOverlay,
} from "./types";
import { uid } from "./timeline";

/**
 * A template is a recipe with blanks. `build` fills the blanks with the
 * user's clips and returns clips, text and effects that stay fully editable.
 */
export type SourceItem = Pick<MediaItem, "id" | "kind" | "duration">;

export interface TemplateResult {
  clips: Clip[];
  texts: TextOverlay[];
  overlays: Overlays;
}

export type TemplateCategory = "Trending" | "Story" | "Business" | "Fun";

export interface TemplateDef {
  id: string;
  name: string;
  emoji: string;
  description: string;
  category: TemplateCategory;
  aspect: AspectRatio;
  fit: FitMode;
  /** How many clips the template looks best with. */
  idealClips: number;
  musicVolume?: number;
  build(items: SourceItem[]): TemplateResult;
}

// ---------- helpers ----------

interface ClipFx {
  filter?: ClipFilter;
  motion?: ClipMotion;
  transition?: ClipTransition;
}

/**
 * Hands out clips of a given length, cycling through the user's media. Each
 * video keeps a cursor, so taking several clips from one video walks through
 * it instead of repeating the opening.
 */
function cutter(items: SourceItem[]) {
  const cursors = new Map<string, number>();
  let next = 0;
  return (seconds: number, fx: ClipFx = {}, index?: number): Clip => {
    const item = items[(index ?? next++) % items.length];
    let start = 0;
    let len = seconds;
    if (item.kind === "video") {
      len = Math.min(seconds, item.duration);
      start = cursors.get(item.id) ?? 0;
      if (start + len > item.duration - 0.05) start = 0;
      cursors.set(item.id, start + len);
    }
    return { id: uid("clip"), mediaId: item.id, in: start, out: start + len, volume: 1, ...fx };
  };
}

/** Length to use for an item when a template plays each clip once. */
const natural = (item: SourceItem, max: number) =>
  item.kind === "video" ? Math.min(item.duration, max) : Math.min(3, max);

const total = (clips: Clip[]) => clips.reduce((s, c) => s + (c.out - c.in), 0);

function text(
  value: string,
  start: number,
  end: number,
  opts: Partial<TextOverlay> = {},
): TextOverlay {
  return {
    id: uid("text"),
    text: value,
    start: Math.max(0, start),
    end: Math.max(start + 0.2, end),
    x: 0.5,
    y: 0.5,
    size: 0.06,
    color: "#ffffff",
    style: "bold",
    anim: "fade",
    font: "sans",
    ...opts,
  };
}

/** Places one caption per clip, from a list that repeats if needed. */
function perClip(clips: Clip[], captions: string[], opts: Partial<TextOverlay>, pad = 0.15) {
  let t = 0;
  return clips.map((c, i) => {
    const len = c.out - c.in;
    const out = text(captions[i % captions.length], t + pad, t + len - pad / 2, opts);
    t += len;
    return out;
  });
}

// ---------- the templates ----------

export const TEMPLATES: TemplateDef[] = [
  {
    id: "fast-montage",
    name: "Fast Montage",
    emoji: "⚡",
    description: "Quick punchy cuts with zoom hits and flashes. Made for music.",
    category: "Trending",
    aspect: "9:16",
    fit: "fill",
    idealClips: 4,
    musicVolume: 0.9,
    build(items) {
      const take = cutter(items);
      const cuts = Math.max(12, Math.min(24, items.length * 4));
      const clips = Array.from({ length: cuts }, (_, i) =>
        take(0.7, { motion: "punch", filter: "vivid", transition: i % 4 === 0 ? "flash" : "cut" }),
      );
      const d = total(clips);
      return {
        clips,
        texts: [
          text("SUMMER\nRECAP", 0.1, 2.3, { font: "display", size: 0.11, anim: "pop", style: "bold" }),
          text("follow for part 2 ➜", d - 1.6, d, { size: 0.045, y: 0.82, anim: "slide", style: "highlight", bg: "#ffffff", color: "#111111" }),
        ],
        overlays: { fadeOut: true },
      };
    },
  },
  {
    id: "wait-for-it",
    name: "Wait For It",
    emoji: "👀",
    description: "Builds suspense, then hits the reveal with a flash.",
    category: "Trending",
    aspect: "9:16",
    fit: "fill",
    idealClips: 3,
    build(items) {
      const take = cutter(items);
      const build = Math.max(1, items.length - 1);
      const clips: Clip[] = [];
      for (let i = 0; i < build; i++) clips.push(take(natural(items[i], 2.5), { motion: "zoomIn" }, i));
      const revealAt = total(clips);
      clips.push(take(natural(items[items.length - 1], 4), { motion: "punch", transition: "flash", filter: "vivid" }, items.length - 1));
      const d = total(clips);
      return {
        clips,
        texts: [
          text("Wait for it… 👀", 0, revealAt, { y: 0.14, size: 0.05, style: "highlight", bg: "#ffffff", color: "#111111", anim: "none" }),
          text("😱😱😱", revealAt, Math.min(d, revealAt + 1.6), { size: 0.1, anim: "pop" }),
        ],
        overlays: {},
      };
    },
  },
  {
    id: "cinematic",
    name: "Cinematic Story",
    emoji: "🎬",
    description: "Slow zooms, warm color, film grain and movie bars.",
    category: "Story",
    aspect: "16:9",
    fit: "fill",
    idealClips: 4,
    musicVolume: 0.7,
    build(items) {
      const take = cutter(items);
      const clips = items.map((it, i) =>
        take(natural(it, 4), { motion: i % 2 ? "zoomOut" : "zoomIn", filter: "warm", transition: "fade" }, i),
      );
      const d = total(clips);
      return {
        clips,
        texts: [
          text("THE JOURNEY", 0.6, Math.min(d, 3.6), { font: "serif", size: 0.08, anim: "fade" }),
          text("fin.", Math.max(0, d - 2), d, { font: "serif", size: 0.06, anim: "fade" }),
        ],
        overlays: { letterbox: true, vignette: true, grain: true, fadeOut: true },
      };
    },
  },
  {
    id: "day-in-my-life",
    name: "Day in My Life",
    emoji: "☀️",
    description: "Time-stamped moments from morning to night.",
    category: "Story",
    aspect: "9:16",
    fit: "fill",
    idealClips: 6,
    build(items) {
      const take = cutter(items);
      const clips = items.map((it, i) => take(natural(it, 2.2), { motion: "zoomIn" }, i));
      const times = ["6:30 AM ☀️", "8:00 AM ☕", "10:00 AM 💻", "1:00 PM 🥗", "4:00 PM 🏋️", "7:00 PM 🍝", "10:00 PM 🌙"];
      return {
        clips,
        texts: [
          text("a day in my life", 0, Math.min(total(clips), 2.2), { font: "hand", size: 0.06, y: 0.16, anim: "pop" }),
          ...perClip(clips, times, { style: "highlight", bg: "#ffffff", color: "#111111", size: 0.042, y: 0.8, anim: "slide" }),
        ],
        overlays: { progressBar: "#ffffff" },
      };
    },
  },
  {
    id: "top-5",
    name: "Top 5 Countdown",
    emoji: "🏆",
    description: "Five moments counted down from #5 to #1.",
    category: "Fun",
    aspect: "9:16",
    fit: "fill",
    idealClips: 5,
    build(items) {
      const take = cutter(items);
      const clips = Array.from({ length: 5 }, (_, i) =>
        take(2.5, { motion: "zoomIn", transition: "flash" }, i % items.length),
      );
      return {
        clips,
        texts: [
          text("TOP 5 MOMENTS", 0, total(clips), { style: "box", y: 0.1, size: 0.05, font: "display", anim: "none" }),
          ...perClip(clips, ["#5", "#4", "#3", "#2", "#1"], { font: "display", size: 0.16, y: 0.72, color: "#facc15", style: "outline", anim: "pop" }, 0.05),
        ],
        overlays: {},
      };
    },
  },
  {
    id: "vintage",
    name: "Vintage Memories",
    emoji: "📼",
    description: "Faded film look with grain and handwritten titles.",
    category: "Story",
    aspect: "4:5",
    fit: "fill",
    idealClips: 4,
    musicVolume: 0.7,
    build(items) {
      const take = cutter(items);
      const clips = items.map((it, i) => take(natural(it, 3), { motion: "zoomIn", filter: "vintage", transition: "fade" }, i));
      const d = total(clips);
      return {
        clips,
        texts: [
          text("memories ♡", 0.5, Math.min(d, 3.5), { font: "hand", size: 0.075, y: 0.78, anim: "fade" }),
          text("summer '26", 0.8, Math.min(d, 3.5), { font: "hand", size: 0.04, y: 0.86, anim: "fade", color: "#fde68a" }),
        ],
        overlays: { grain: true, vignette: true, fadeOut: true },
      };
    },
  },
  {
    id: "travel-diary",
    name: "Travel Diary",
    emoji: "✈️",
    description: "Sweeping pans, cool tones and location tags.",
    category: "Story",
    aspect: "16:9",
    fit: "fill",
    idealClips: 5,
    musicVolume: 0.8,
    build(items) {
      const take = cutter(items);
      const clips = items.map((it, i) =>
        take(natural(it, 3), { motion: i % 2 ? "panLeft" : "panRight", filter: "cool", transition: "fade" }, i),
      );
      const d = total(clips);
      return {
        clips,
        texts: [
          text("WANDERLUST", 0.3, Math.min(d, 2.8), { font: "display", size: 0.13, anim: "pop" }),
          text("📍 Somewhere beautiful", Math.min(d, 2.9), d, { size: 0.045, y: 0.86, style: "bold", anim: "slide" }),
        ],
        overlays: { vignette: true, fadeOut: true },
      };
    },
  },
  {
    id: "quote-slideshow",
    name: "Quote Slideshow",
    emoji: "💬",
    description: "Calm slides with quotes that type themselves out.",
    category: "Story",
    aspect: "1:1",
    fit: "fill",
    idealClips: 3,
    musicVolume: 0.6,
    build(items) {
      const take = cutter(items);
      const clips = items.map((_, i) => take(4, { motion: "zoomIn", filter: "faded", transition: "fade" }, i));
      const quotes = [
        "Do more of what makes you happy.",
        "Small steps every day.",
        "Stay close to people who feel like sunlight.",
        "Collect moments, not things.",
      ];
      return {
        clips,
        texts: [
          ...perClip(clips, quotes, { font: "serif", size: 0.065, anim: "typewriter", style: "bold" }, 0.4),
          text("— your name", 1.6, total(clips), { size: 0.035, y: 0.88, anim: "fade", color: "#e5e7eb" }),
        ],
        overlays: { vignette: true, fadeOut: true },
      };
    },
  },
  {
    id: "classic-meme",
    name: "Classic Meme",
    emoji: "😂",
    description: "Big top and bottom captions. Instantly recognizable.",
    category: "Fun",
    aspect: "1:1",
    fit: "fit",
    idealClips: 1,
    build(items) {
      const take = cutter(items);
      const clips = items.slice(0, 3).map((it, i) => take(natural(it, 6), {}, i));
      const d = total(clips);
      const meme = { font: "display" as const, size: 0.1, style: "outline" as const, anim: "none" as const };
      return {
        clips,
        texts: [
          text("WHEN THE EDIT", 0, d, { ...meme, y: 0.1 }),
          text("FINALLY RENDERS", 0, d, { ...meme, y: 0.9 }),
        ],
        overlays: {},
      };
    },
  },
  {
    id: "product-spotlight",
    name: "Product Spotlight",
    emoji: "🛍️",
    description: "Clean, punchy product ad with a call to action.",
    category: "Business",
    aspect: "4:5",
    fit: "fill",
    idealClips: 4,
    build(items) {
      const take = cutter(items);
      const clips = items.map((it, i) =>
        take(natural(it, 2.5), { motion: i % 2 ? "punch" : "zoomIn", filter: "vivid", transition: i === 0 ? "cut" : "flash" }, i),
      );
      const d = total(clips);
      return {
        clips,
        texts: [
          text("NEW DROP", 0.2, Math.min(d, 2.6), { style: "highlight", bg: "#8b5cf6", size: 0.07, y: 0.18, anim: "pop" }),
          text("Limited edition", 0.5, Math.min(d, 2.6), { size: 0.04, y: 0.27, anim: "fade" }),
          text("Shop now ➜", Math.max(0, d - 2.2), d, { style: "box", bg: "#ffffff", color: "#111111", size: 0.055, y: 0.78, anim: "pop" }),
        ],
        overlays: { fadeOut: true },
      };
    },
  },
];

export const getTemplate = (id: string | null | undefined) => TEMPLATES.find((t) => t.id === id);

/** Fills a template with the user's media and returns the new project. */
export function applyTemplate(def: TemplateDef, items: SourceItem[], current: Project): Project {
  const visual = items.filter((i) => i.kind !== "audio");
  if (!visual.length) throw new Error("Add at least one video or photo to use a template.");
  const result = def.build(visual);
  return {
    ...current,
    name: current.name === "Untitled video" ? def.name : current.name,
    aspect: def.aspect,
    fit: def.fit,
    clips: result.clips,
    texts: result.texts,
    overlays: result.overlays,
    music: current.music ? { ...current.music, volume: def.musicVolume ?? current.music.volume } : null,
    templateId: def.id,
  };
}
