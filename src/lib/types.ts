// The "recipe" for a video. Nothing here is a rendered video: preview and
// export both read this object and draw frames from it.

export type MediaKind = "video" | "image" | "audio";

export interface MediaItem {
  id: string;
  name: string;
  kind: MediaKind;
  file: File;
  url: string; // object URL for preview playback
  duration: number; // seconds (images: 0)
  width: number;
  height: number;
  thumbnail?: string; // data URL
  hasAudio: boolean;
}

export type ClipFilter = "none" | "bw" | "warm" | "cool" | "vintage" | "vivid" | "faded";
export type ClipMotion = "none" | "zoomIn" | "zoomOut" | "panLeft" | "panRight" | "punch";
export type ClipTransition = "cut" | "fade" | "flash";

export interface Clip {
  id: string;
  mediaId: string;
  /** Start point inside the source media, in seconds. */
  in: number;
  /** End point inside the source media, in seconds. */
  out: number;
  volume: number; // 0..1
  filter?: ClipFilter;
  motion?: ClipMotion;
  /** How this clip enters: a hard cut, a fade from black or a white flash. */
  transition?: ClipTransition;
}

export type TextStyle = "bold" | "outline" | "box" | "highlight";
export type TextAnim = "none" | "fade" | "pop" | "slide" | "typewriter";
export type TextFont = "sans" | "display" | "serif" | "hand";

export interface TextOverlay {
  id: string;
  text: string;
  /** Position on the output timeline, in seconds. */
  start: number;
  end: number;
  /** Centre of the text, as a fraction of the frame (0..1). */
  x: number;
  y: number;
  /** Font size as a fraction of the frame height. */
  size: number;
  color: string;
  style: TextStyle;
  anim: TextAnim;
  font?: TextFont;
  /** Background color for the box and highlight styles. */
  bg?: string;
  /** Set on auto-generated captions so they can be restyled or removed together. */
  group?: "caption";
}

export interface MusicTrack {
  mediaId: string;
  volume: number;
}

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
export type FitMode = "fill" | "fit";

/** Effects drawn over the whole video. */
export interface Overlays {
  letterbox?: boolean;
  vignette?: boolean;
  grain?: boolean;
  /** Color of a thin progress bar along the top, or null for none. */
  progressBar?: string | null;
  /** Fade to black at the very end. */
  fadeOut?: boolean;
}

export interface Project {
  name: string;
  aspect: AspectRatio;
  fit: FitMode;
  clips: Clip[];
  texts: TextOverlay[];
  music: MusicTrack | null;
  overlays?: Overlays;
  /** The template this project was started from, if any. */
  templateId?: string;
}

export const ASPECTS: Record<AspectRatio, { w: number; h: number; label: string }> = {
  "9:16": { w: 1080, h: 1920, label: "TikTok · Reels · Shorts" },
  "16:9": { w: 1920, h: 1080, label: "YouTube" },
  "1:1": { w: 1080, h: 1080, label: "Square post" },
  "4:5": { w: 1080, h: 1350, label: "Instagram feed" },
};

/** Default length of an image clip, in seconds. */
export const IMAGE_DURATION = 3;
