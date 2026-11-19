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

export interface Clip {
  id: string;
  mediaId: string;
  /** Start point inside the source media, in seconds. */
  in: number;
  /** End point inside the source media, in seconds. */
  out: number;
  volume: number; // 0..1
}

export type TextStyle = "bold" | "outline" | "box";
export type TextAnim = "none" | "fade" | "pop" | "slide";

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
}

export interface MusicTrack {
  mediaId: string;
  volume: number;
}

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";
export type FitMode = "fill" | "fit";

export interface Project {
  name: string;
  aspect: AspectRatio;
  fit: FitMode;
  clips: Clip[];
  texts: TextOverlay[];
  music: MusicTrack | null;
}

export const ASPECTS: Record<AspectRatio, { w: number; h: number; label: string }> = {
  "9:16": { w: 1080, h: 1920, label: "TikTok · Reels · Shorts" },
  "16:9": { w: 1920, h: 1080, label: "YouTube" },
  "1:1": { w: 1080, h: 1080, label: "Square post" },
  "4:5": { w: 1080, h: 1350, label: "Instagram feed" },
};

/** Default length of an image clip, in seconds. */
export const IMAGE_DURATION = 3;
