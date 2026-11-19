import type { Clip, Project } from "./types";

export interface PlacedClip {
  clip: Clip;
  index: number;
  /** Where the clip starts on the output timeline, in seconds. */
  start: number;
  end: number;
}

export const clipLength = (c: Clip) => Math.max(0, c.out - c.in);

export function layoutClips(clips: Clip[]): PlacedClip[] {
  let t = 0;
  return clips.map((clip, index) => {
    const start = t;
    t += clipLength(clip);
    return { clip, index, start, end: t };
  });
}

export function projectDuration(p: Project): number {
  const clipsEnd = p.clips.reduce((s, c) => s + clipLength(c), 0);
  const textEnd = p.texts.reduce((m, t) => Math.max(m, t.end), 0);
  return Math.max(clipsEnd, textEnd);
}

/** The clip playing at time `t`, and the matching time inside its source. */
export function clipAt(clips: Clip[], t: number): { placed: PlacedClip; sourceTime: number } | null {
  for (const placed of layoutClips(clips)) {
    if (t >= placed.start && t < placed.end) {
      return { placed, sourceTime: placed.clip.in + (t - placed.start) };
    }
  }
  return null;
}

let counter = 0;
export const uid = (prefix = "id") =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
}
