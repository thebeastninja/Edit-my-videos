import type { TextFont } from "./types";

/**
 * Canvas text can't use CSS variables, so we read the real font-family names
 * that next/font put on <html> (see app/layout.tsx) and cache them.
 */
const VARS: Record<TextFont, string> = {
  sans: "--font-inter",
  display: "--font-anton",
  serif: "--font-playfair",
  hand: "--font-marker",
};

const FALLBACK: Record<TextFont, string> = {
  sans: '"Helvetica Neue", Arial, sans-serif',
  display: 'Impact, "Arial Narrow Bold", sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  hand: '"Comic Sans MS", "Marker Felt", cursive',
};

const WEIGHT: Record<TextFont, number> = { sans: 800, display: 400, serif: 700, hand: 400 };
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

const cache = new Map<TextFont, string>();

export function fontFamily(font: TextFont = "sans"): string {
  const hit = cache.get(font);
  if (hit) return hit;
  let family = FALLBACK[font];
  if (typeof document !== "undefined") {
    const v = getComputedStyle(document.documentElement).getPropertyValue(VARS[font]).trim();
    if (v) {
      family = `${v}, ${family}`;
      cache.set(font, `${family}, ${EMOJI}`);
    }
  }
  return `${family}, ${EMOJI}`;
}

export function fontString(font: TextFont | undefined, px: number): string {
  const f = font ?? "sans";
  return `${WEIGHT[f]} ${px}px ${fontFamily(f)}`;
}

/** Makes sure web fonts are downloaded before drawing them on a canvas. */
export async function ensureFonts(fonts: TextFont[] = ["sans", "display", "serif", "hand"]) {
  if (typeof document === "undefined" || !document.fonts) return;
  await Promise.all(
    fonts.map((f) => document.fonts.load(fontString(f, 40), "Aa").catch(() => [])),
  );
}
