import type { MediaItem, MediaKind } from "./types";
import { uid } from "./timeline";

const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|3gp|ogv|mpe?g|ts)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus|weba)$/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)$/i;

export function detectKind(file: File): MediaKind | null {
  if (file.type.startsWith("video/") || VIDEO_EXT.test(file.name)) return "video";
  if (file.type.startsWith("audio/") || AUDIO_EXT.test(file.name)) return "audio";
  if (file.type.startsWith("image/") || IMAGE_EXT.test(file.name)) return "image";
  return null;
}

const once = <T extends Event>(el: EventTarget, ok: string, fail = "error") =>
  new Promise<T>((resolve, reject) => {
    el.addEventListener(ok, (e) => resolve(e as T), { once: true });
    el.addEventListener(fail, () => reject(new Error(`Could not read this file`)), { once: true });
  });

function snapshot(source: CanvasImageSource, sw: number, sh: number): string {
  const tw = 160;
  const th = Math.max(1, Math.round((tw * sh) / Math.max(1, sw)));
  const c = document.createElement("canvas");
  c.width = tw;
  c.height = th;
  c.getContext("2d")!.drawImage(source, 0, 0, tw, th);
  return c.toDataURL("image/jpeg", 0.7);
}

/** Reads a dropped file's duration, size and a thumbnail. */
export async function importFile(file: File): Promise<MediaItem> {
  const kind = detectKind(file);
  if (!kind) throw new Error(`${file.name}: this file type isn't supported`);
  const url = URL.createObjectURL(file);
  const base = { id: uid("media"), name: file.name, kind, file, url };

  try {
    if (kind === "image") {
      const img = new Image();
      img.src = url;
      await once(img, "load");
      return {
        ...base,
        duration: 0,
        width: img.naturalWidth,
        height: img.naturalHeight,
        thumbnail: snapshot(img, img.naturalWidth, img.naturalHeight),
        hasAudio: false,
      };
    }

    if (kind === "audio") {
      const audio = new Audio();
      audio.preload = "metadata";
      audio.src = url;
      await once(audio, "loadedmetadata");
      return { ...base, duration: audio.duration, width: 0, height: 0, hasAudio: true };
    }

    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    await once(video, "loadedmetadata");
    let duration = video.duration;
    if (!isFinite(duration)) {
      // Some WebM files report Infinity until you seek to the end.
      video.currentTime = 1e7;
      await once(video, "seeked");
      duration = video.duration;
    }
    video.currentTime = Math.min(0.5, duration / 3);
    await once(video, "seeked");
    const thumbnail = snapshot(video, video.videoWidth, video.videoHeight);
    const v = video as HTMLVideoElement & {
      mozHasAudio?: boolean;
      webkitAudioDecodedByteCount?: number;
      audioTracks?: { length: number };
    };
    const hasAudio =
      v.mozHasAudio ?? (v.audioTracks ? v.audioTracks.length > 0 : true);
    return {
      ...base,
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
      thumbnail,
      hasAudio,
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(
      `${file.name}: your browser can't open this file. Try converting it to MP4 (H.264).`,
    );
  }
}
