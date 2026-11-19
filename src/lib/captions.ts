"use client";

import type { MediaItem, Project, TextOverlay } from "./types";
import { layoutClips, projectDuration, uid } from "./timeline";
import { decodeAudioRange } from "./export";
import type { WorkerResponse, WorkerWord } from "./captions.worker";

export type Word = WorkerWord;

// ---------- 1. Get the speech audio ----------

const WHISPER_RATE = 16000;

/**
 * Mixes the sound of every clip on the timeline (not the music) into the
 * 16 kHz mono audio Whisper expects. Times line up with the output video.
 */
export async function speechAudio(project: Project, media: Map<string, MediaItem>): Promise<Float32Array | null> {
  const duration = projectDuration(project);
  if (duration <= 0) return null;
  const mb = await import("mediabunny");
  const ctx = new OfflineAudioContext(1, Math.ceil(duration * WHISPER_RATE), WHISPER_RATE);
  let any = false;
  for (const placed of layoutClips(project.clips)) {
    const item = media.get(placed.clip.mediaId);
    if (!item || item.kind !== "video" || !item.hasAudio) continue;
    const buf = await decodeAudioRange(mb, item.file, placed.clip.in, placed.clip.out);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(placed.start, 0, placed.end - placed.start);
    any = true;
  }
  if (!any) return null;
  const rendered = await ctx.startRendering();
  return rendered.getChannelData(0);
}

// ---------- 2. Transcribe (in a background worker) ----------

export type CaptionProgress =
  | { stage: "audio" }
  | { stage: "load" }
  | { stage: "download"; progress: number }
  | { stage: "transcribe" };

let worker: Worker | null = null;

export function transcribe(
  audio: Float32Array,
  language: string | null,
  onProgress: (p: CaptionProgress) => void,
): Promise<{ words: Word[]; device: string }> {
  worker ??= new Worker(new URL("./captions.worker.ts", import.meta.url), { type: "module", name: "captions" });
  const w = worker;
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        onProgress(msg.stage === "download" ? { stage: "download", progress: msg.progress } : { stage: msg.stage });
        return;
      }
      w.removeEventListener("message", onMessage);
      if (msg.type === "result") resolve({ words: msg.words, device: msg.device });
      else reject(new Error(friendlyError(msg.message)));
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ type: "transcribe", audio, language });
  });
}

function friendlyError(message: string): string {
  if (/fetch|network|load failed|NetworkError|ERR_/i.test(message)) {
    return "Couldn't download the speech AI. Check your internet connection and try again.";
  }
  if (/memory|allocation|OOM/i.test(message)) {
    return "Your device ran out of memory. Try a shorter video, or close other tabs and try again.";
  }
  return `Captions failed: ${message}`;
}

// ---------- 3. Turn words into styled captions ----------

export type CaptionStyleId = "pop" | "highlight" | "clean" | "neon" | "boxed";
export type CaptionLength = "punchy" | "sentence";
export type CaptionPosition = "top" | "middle" | "bottom";

export const CAPTION_STYLES: Record<
  CaptionStyleId,
  { label: string; uppercase: boolean; overlay: Partial<TextOverlay> }
> = {
  pop: { label: "Bold Pop", uppercase: true, overlay: { font: "display", style: "outline", color: "#ffffff", size: 0.068, anim: "pop" } },
  highlight: { label: "Highlight", uppercase: false, overlay: { font: "sans", style: "highlight", color: "#111111", bg: "#facc15", size: 0.05, anim: "pop" } },
  clean: { label: "Clean", uppercase: false, overlay: { font: "sans", style: "bold", color: "#ffffff", size: 0.045, anim: "fade" } },
  neon: { label: "Neon", uppercase: true, overlay: { font: "sans", style: "outline", color: "#a3e635", size: 0.058, anim: "pop" } },
  boxed: { label: "Boxed", uppercase: false, overlay: { font: "sans", style: "box", color: "#ffffff", bg: "#111111", size: 0.045, anim: "slide" } },
};

export const POSITION_Y: Record<CaptionPosition, number> = { top: 0.2, middle: 0.5, bottom: 0.74 };

/** Style fields applied to every caption when the user picks a look. */
export function captionLook(style: CaptionStyleId, position: CaptionPosition): Partial<TextOverlay> {
  return { ...CAPTION_STYLES[style].overlay, x: 0.5, y: POSITION_Y[position] };
}

// Whisper sometimes writes sound descriptions like "[Music]" or "(laughs)".
const NOISE = /^[[(*♪].*[\])*♪]$/;

export function buildCaptions(
  words: Word[],
  style: CaptionStyleId,
  length: CaptionLength,
  position: CaptionPosition,
): TextOverlay[] {
  const clean = words
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => w.text && !NOISE.test(w.text) && w.end > w.start - 0.01);

  // Group words into short captions.
  const maxWords = length === "punchy" ? 3 : 8;
  const maxChars = length === "punchy" ? 18 : 42;
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of clean) {
    const prev = cur[cur.length - 1];
    const chars = cur.reduce((s, x) => s + x.text.length + 1, 0) + w.text.length;
    const pause = prev ? w.start - prev.end > 0.6 : false;
    if (cur.length && (cur.length >= maxWords || chars > maxChars || pause)) {
      groups.push(cur);
      cur = [];
    }
    cur.push(w);
    const len = cur.reduce((s, x) => s + x.text.length + 1, 0);
    // End at sentence ends, and at commas once a full line is long enough.
    if (/[.!?]$/.test(w.text) || (length === "sentence" && /[,;:]$/.test(w.text) && len >= 14)) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);

  const upper = CAPTION_STYLES[style].uppercase;
  const look = captionLook(style, position);
  return groups.map((g, i) => {
    const start = g[0].start;
    const next = groups[i + 1]?.[0].start;
    let end = g[g.length - 1].end + 0.25;
    // Close small gaps so captions don't flicker between phrases.
    if (next !== undefined && next - end < 0.5) end = next;
    end = Math.max(end, start + 0.35);
    let value = g.map((w) => w.text).join(" ").replace(/\s+([,.!?;:])/g, "$1");
    if (upper) value = value.toUpperCase();
    return {
      id: uid("cap"),
      text: value,
      start,
      end,
      x: 0.5,
      y: 0.5,
      size: 0.05,
      color: "#ffffff",
      style: "bold",
      anim: "pop",
      ...look,
      group: "caption",
    } satisfies TextOverlay;
  });
}

export const LANGUAGES: [string, string][] = [
  ["", "Auto-detect"],
  ["english", "English"],
  ["spanish", "Spanish"],
  ["french", "French"],
  ["german", "German"],
  ["portuguese", "Portuguese"],
  ["italian", "Italian"],
  ["arabic", "Arabic"],
  ["hindi", "Hindi"],
  ["turkish", "Turkish"],
  ["russian", "Russian"],
  ["japanese", "Japanese"],
  ["korean", "Korean"],
  ["chinese", "Chinese"],
  ["dutch", "Dutch"],
];
