"use client";

import type { MediaItem, Project } from "./types";
import { ASPECTS } from "./types";
import { layoutClips, projectDuration } from "./timeline";
import { drawFrame, type FrameSource } from "./render";
import { ensureFonts } from "./fonts";
import type { PlacedClip } from "./timeline";

export type ExportQuality = "720p" | "1080p";

export interface ExportOptions {
  quality: ExportQuality;
  fps: number;
  onProgress?: (fraction: number, stage: string) => void;
  signal?: AbortSignal;
}

export interface ExportResult {
  blob: Blob;
  mimeType: string;
  fileName: string;
}

const SAMPLE_RATE = 48000;
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function outputSize(project: Project, quality: ExportQuality) {
  const base = ASPECTS[project.aspect];
  const scale = quality === "720p" ? 720 / Math.min(base.w, base.h) : 1;
  return { width: even(base.w * scale), height: even(base.h * scale) };
}

class Cancelled extends Error {
  constructor() {
    super("Export cancelled");
  }
}

/**
 * Renders the project to an MP4 in the browser. Frames are decoded with
 * WebCodecs (via Mediabunny), drawn with the same renderer as the preview,
 * and encoded back to H.264 (or the best codec the browser supports).
 */
export async function exportProject(
  project: Project,
  media: Map<string, MediaItem>,
  opts: ExportOptions,
): Promise<ExportResult> {
  const mb = await import("mediabunny");
  const { fps, onProgress, signal } = opts;
  const check = () => {
    if (signal?.aborted) throw new Cancelled();
  };

  const duration = projectDuration(project);
  if (duration <= 0) throw new Error("Add at least one clip or text before exporting.");
  const { width, height } = outputSize(project, opts.quality);
  const totalFrames = Math.max(1, Math.round(duration * fps));

  // 1. Mix all audio (clip sound + music) offline into one buffer.
  onProgress?.(0, "Mixing audio");
  const mixed = await mixAudio(mb, project, media, duration, check);
  check();

  // 2. Set up the output file.
  const output = new mb.Output({
    format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new mb.BufferTarget(),
  });
  const preferredVideo = (["avc", "hevc", "vp9", "av1"] as const).filter((c) =>
    output.format.getSupportedVideoCodecs().includes(c),
  );
  const videoCodec = await mb.getFirstEncodableVideoCodec([...preferredVideo], {
    width,
    height,
    frameRate: fps,
  });
  if (!videoCodec) {
    throw new Error(
      "This browser can't encode video. Please use a recent version of Chrome, Edge or Safari.",
    );
  }

  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const ctx = canvas.getContext("2d") as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D;

  const videoSource = new mb.CanvasSource(canvas, {
    codec: videoCodec,
    bitrate: opts.quality === "1080p" ? 8_000_000 : 4_000_000,
    keyFrameInterval: 2,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  let audioSource: InstanceType<typeof mb.AudioBufferSource> | null = null;
  if (mixed) {
    // AAC plays everywhere (iPhone, QuickTime, Windows). Browsers without a
    // built-in AAC encoder (Firefox, some Linux builds) get a WebAssembly one.
    if (!(await mb.canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: SAMPLE_RATE }))) {
      try {
        const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
        registerAacEncoder();
      } catch {
        // Fall back to Opus below.
      }
    }
    const audioCodec = await mb.getFirstEncodableAudioCodec(
      (["aac", "opus"] as const).filter((c) => output.format.getSupportedAudioCodecs().includes(c)),
      { numberOfChannels: 2, sampleRate: SAMPLE_RATE },
    );
    if (audioCodec) {
      audioSource = new mb.AudioBufferSource({ codec: audioCodec, bitrate: 192_000 });
      output.addAudioTrack(audioSource);
    }
  }

  await output.start();

  // Audio is fed one second at a time alongside the video so the muxer can
  // interleave both tracks.
  let audioSentUntil = 0;
  const feedAudio = async (untilSeconds: number) => {
    if (!audioSource || !mixed) return;
    const until = Math.min(untilSeconds, mixed.duration);
    if (until <= audioSentUntil) return;
    const from = Math.round(audioSentUntil * SAMPLE_RATE);
    const to = Math.round(until * SAMPLE_RATE);
    if (to <= from) return;
    const slice = new AudioBuffer({
      length: to - from,
      numberOfChannels: mixed.numberOfChannels,
      sampleRate: SAMPLE_RATE,
    });
    for (let ch = 0; ch < mixed.numberOfChannels; ch++) {
      slice.copyToChannel(mixed.getChannelData(ch).subarray(from, to), ch);
    }
    await audioSource.add(slice);
    audioSentUntil = until;
  };

  await ensureFonts();
  let frame = 0;
  let current: PlacedClip | null = null;
  const emit = async (source: FrameSource | null) => {
    const t = frame / fps;
    drawFrame(
      ctx,
      width,
      height,
      {
        source,
        clip: current?.clip ?? null,
        clipTime: current ? t - current.start : 0,
        clipLength: current ? current.end - current.start : 0,
      },
      project,
      t,
      duration,
    );
    await videoSource.add(t, 1 / fps);
    frame++;
    if (frame % fps === 0) await feedAudio(frame / fps + 1);
    if (frame % 5 === 0) {
      onProgress?.(frame / totalFrames, "Rendering video");
      check();
    }
  };

  try {
    // 3. Render every frame, clip by clip.
    for (const placed of layoutClips(project.clips)) {
      current = placed;
      const item = media.get(placed.clip.mediaId);
      const endFrame = Math.round(placed.end * fps);
      const count = endFrame - frame;
      if (!item || count <= 0) {
        while (frame < endFrame) await emit(null);
        continue;
      }

      if (item.kind === "image") {
        const bitmap = await createImageBitmap(item.file);
        const src = { image: bitmap, width: bitmap.width, height: bitmap.height };
        for (let i = 0; i < count; i++) await emit(src);
        bitmap.close();
        continue;
      }

      const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(item.file) });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) {
          throw new Error(`Can't decode the video in "${item.name}". Try converting it to MP4 (H.264).`);
        }
        const first = await track.getFirstTimestamp();
        const sink = new mb.CanvasSink(track, { poolSize: 3 });
        const times = Array.from(
          { length: count },
          (_, i) => first + placed.clip.in + (i + 0.5) / fps,
        );
        let last: FrameSource | null = null;
        for await (const wc of sink.canvasesAtTimestamps(times)) {
          if (wc) last = { image: wc.canvas, width: wc.canvas.width, height: wc.canvas.height };
          await emit(last);
        }
        // Safety net in case the decoder returned fewer frames than asked.
        while (frame < endFrame) await emit(last);
      } finally {
        input.dispose();
      }
    }

    // Text that runs past the last clip is drawn over black.
    current = null;
    while (frame < totalFrames) await emit(null);

    await feedAudio(duration + 1);
    onProgress?.(1, "Finishing");
    await output.finalize();
  } catch (err) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel();
    throw err;
  }

  const buffer = (output.target as InstanceType<typeof mb.BufferTarget>).buffer!;
  const mimeType = await output.getMimeType();
  const safeName = (project.name || "moicut-video").replace(/[^\w\- ]+/g, "").trim() || "moicut-video";
  return {
    blob: new Blob([buffer], { type: "video/mp4" }),
    mimeType,
    fileName: `${safeName}.mp4`,
  };
}

type Mediabunny = typeof import("mediabunny");

/** Decodes the [from, to) range of a file's audio into one AudioBuffer. */
async function decodeAudioRange(
  mb: Mediabunny,
  file: File,
  from: number,
  to: number,
): Promise<AudioBuffer | null> {
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) return null;
    const first = await track.getFirstTimestamp();
    const rate = track.sampleRate;
    const channels = Math.min(2, track.numberOfChannels);
    const length = Math.max(1, Math.ceil((to - from) * rate));
    const out = new AudioBuffer({ length, numberOfChannels: channels, sampleRate: rate });
    const sink = new mb.AudioBufferSink(track);
    for await (const { buffer, timestamp } of sink.buffers(first + from, first + to)) {
      const offset = Math.round((timestamp - first - from) * rate);
      const skip = Math.max(0, -offset);
      const dest = Math.max(0, offset);
      const n = Math.min(buffer.length - skip, length - dest);
      if (n <= 0) continue;
      for (let ch = 0; ch < channels; ch++) {
        const data = buffer.getChannelData(Math.min(ch, buffer.numberOfChannels - 1));
        out.copyToChannel(data.subarray(skip, skip + n), ch, dest);
      }
    }
    return out;
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

async function mixAudio(
  mb: Mediabunny,
  project: Project,
  media: Map<string, MediaItem>,
  duration: number,
  check: () => void,
): Promise<AudioBuffer | null> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  let hasAny = false;

  for (const placed of layoutClips(project.clips)) {
    check();
    const item = media.get(placed.clip.mediaId);
    if (!item || item.kind !== "video" || !item.hasAudio || placed.clip.volume <= 0) continue;
    const buf = await decodeAudioRange(mb, item.file, placed.clip.in, placed.clip.out);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = placed.clip.volume;
    src.connect(gain).connect(ctx.destination);
    src.start(placed.start, 0, placed.end - placed.start);
    hasAny = true;
  }

  const music = project.music && media.get(project.music.mediaId);
  if (project.music && music && project.music.volume > 0) {
    check();
    const buf = await decodeAudioRange(mb, music.file, 0, Math.min(music.duration, duration));
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = buf.duration < duration;
      const gain = ctx.createGain();
      const v = project.music.volume;
      const fade = Math.min(1.5, duration / 4);
      gain.gain.setValueAtTime(v, 0);
      gain.gain.setValueAtTime(v, Math.max(0, duration - fade));
      gain.gain.linearRampToValueAtTime(0, duration);
      src.connect(gain).connect(ctx.destination);
      src.start(0, 0, duration);
      hasAny = true;
    }
  }

  if (!hasAny) return null;
  return ctx.startRendering();
}
