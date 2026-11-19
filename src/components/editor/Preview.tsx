"use client";

import { useEffect, useRef } from "react";
import type { MediaItem, Project, TextOverlay } from "@/lib/types";
import { ASPECTS } from "@/lib/types";
import { clipAt, projectDuration } from "@/lib/timeline";
import { drawFrame, measureText, type FrameSource } from "@/lib/render";
import { ensureFonts } from "@/lib/fonts";
import type { PlaybackStore } from "@/lib/playback";
import type { Action, Selection } from "@/lib/store";

interface Props {
  project: Project;
  media: Map<string, MediaItem>;
  playback: PlaybackStore;
  selection: Selection;
  dispatch: (a: Action) => void;
}

/** Longest side of the preview canvas, in pixels. Export renders full size. */
const PREVIEW_MAX = 960;

export default function Preview({ project, media, playback, selection, dispatch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const music = useRef<HTMLAudioElement | null>(null);
  const hasDrawn = useRef(false);

  // Keep the latest props in refs so the animation loop never goes stale.
  const projectRef = useRef(project);
  const mediaRef = useRef(media);
  projectRef.current = project;
  mediaRef.current = media;

  const { w: aw, h: ah } = ASPECTS[project.aspect];
  const scale = PREVIEW_MAX / Math.max(aw, ah);
  const cw = Math.round(aw * scale);
  const ch = Math.round(ah * scale);

  // Create (and clean up) one hidden <video>/<img> per media item.
  useEffect(() => {
    for (const item of media.values()) {
      if (item.kind === "video" && !videos.current.has(item.id)) {
        const v = document.createElement("video");
        v.src = item.url;
        v.preload = "auto";
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        videos.current.set(item.id, v);
      }
      if (item.kind === "image" && !images.current.has(item.id)) {
        const img = new Image();
        img.src = item.url;
        images.current.set(item.id, img);
      }
    }
    for (const [id, v] of videos.current) {
      if (!media.has(id)) {
        v.pause();
        v.removeAttribute("src");
        v.load();
        videos.current.delete(id);
      }
    }
    for (const id of images.current.keys()) if (!media.has(id)) images.current.delete(id);
  }, [media]);

  // Background music element.
  const musicItem = project.music ? media.get(project.music.mediaId) : undefined;
  useEffect(() => {
    if (!musicItem) {
      music.current?.pause();
      music.current = null;
      return;
    }
    const a = new Audio(musicItem.url);
    a.preload = "auto";
    a.loop = true;
    music.current = a;
    return () => a.pause();
  }, [musicItem]);

  useEffect(() => {
    ensureFonts();
  }, []);

  // The render loop: sync media elements to the playhead and draw a frame.
  useEffect(() => {
    let raf = 0;
    let lastWall = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const p = projectRef.current;
      const { playing } = playback.get();
      let { time } = playback.get();
      const duration = projectDuration(p);
      const dt = Math.min(0.25, (now - lastWall) / 1000);
      lastWall = now;

      if (playing) {
        time += dt;
        if (time >= duration) {
          time = duration;
          playback.set({ time, playing: false });
        } else {
          playback.set({ time });
        }
      }

      const hit = clipAt(p.clips, time);
      const activeItem = hit ? mediaRef.current.get(hit.placed.clip.mediaId) : undefined;
      let source: FrameSource | null = null;
      let waiting = false; // active video is seeking/loading: keep the last frame

      for (const [id, v] of videos.current) {
        const isActive = activeItem?.id === id && activeItem.kind === "video";
        if (!isActive) {
          if (!v.paused) v.pause();
          continue;
        }
        const target = hit!.sourceTime;
        v.volume = Math.max(0, Math.min(1, hit!.placed.clip.volume));
        const drift = Math.abs(v.currentTime - target);
        if (playing) {
          if (drift > 0.25 && !v.seeking) v.currentTime = target;
          if (v.paused) v.play().catch(() => {});
        } else {
          if (!v.paused) v.pause();
          if (drift > 1 / 60 && !v.seeking) v.currentTime = target;
        }
        if (v.readyState >= 2 && !v.seeking) {
          source = { image: v, width: v.videoWidth, height: v.videoHeight };
        } else {
          waiting = true;
        }
      }

      if (activeItem?.kind === "image") {
        const img = images.current.get(activeItem.id);
        if (img?.complete && img.naturalWidth) {
          source = { image: img, width: img.naturalWidth, height: img.naturalHeight };
        }
      }

      const a = music.current;
      if (a && p.music) {
        a.volume = Math.max(0, Math.min(1, p.music.volume));
        const len = isFinite(a.duration) && a.duration > 0 ? a.duration : Infinity;
        const target = time % len;
        if (playing && time < duration) {
          if (Math.abs(a.currentTime - target) > 0.3) a.currentTime = target;
          if (a.paused) a.play().catch(() => {});
        } else if (!a.paused) a.pause();
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx && !(waiting && hasDrawn.current)) {
        hasDrawn.current = true;
        drawFrame(
          ctx,
          canvas.width,
          canvas.height,
          {
            source,
            clip: hit?.placed.clip ?? null,
            clipTime: hit ? time - hit.placed.start : 0,
            clipLength: hit ? hit.placed.end - hit.placed.start : 0,
          },
          p,
          time,
          duration,
        );
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playback]);

  // Click a caption to select it; drag a selected caption to move it.
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const toFrame = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  const hitText = (x: number, y: number): TextOverlay | null => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return null;
    const t = playback.get().time;
    const visible = project.texts.filter((o) => t >= o.start && t < o.end).reverse();
    for (const o of visible) {
      const box = measureText(ctx, cw, ch, o);
      if (Math.abs(x - o.x) < box.width / 2 + 0.02 && Math.abs(y - o.y) < box.height / 2 + 0.015) return o;
    }
    return null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toFrame(e);
    const hit = hitText(x, y);
    if (!hit) {
      dispatch({ type: "select", selection: null });
      return;
    }
    dispatch({ type: "select", selection: { kind: "text", id: hit.id } });
    dispatch({ type: "checkpoint" });
    drag.current = { id: hit.id, dx: x - hit.x, dy: y - hit.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const { x, y } = toFrame(e);
    const clamp = (n: number) => Math.max(0.02, Math.min(0.98, n));
    dispatch({
      type: "updateText",
      id: drag.current.id,
      patch: { x: clamp(x - drag.current.dx), y: clamp(y - drag.current.dy) },
      commit: false,
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const selectedText =
    selection?.kind === "text" ? project.texts.find((t) => t.id === selection.id) : undefined;

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div className="relative" style={{ aspectRatio: `${aw} / ${ah}`, height: "100%", maxWidth: "100%" }}>
        <canvas
          ref={canvasRef}
          width={cw}
          height={ch}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="h-full w-full cursor-crosshair rounded-xl bg-black shadow-2xl shadow-black/50 ring-1 ring-white/10"
          style={{ touchAction: "none" }}
        />
        {selectedText && (
          <div
            title="Drag the text to move it"
            className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-violet-500 shadow"
            style={{ left: `${selectedText.x * 100}%`, top: `${selectedText.y * 100}%` }}
          />
        )}
        {project.clips.length === 0 && project.texts.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/50">
            <div className="text-4xl">🎬</div>
            <p>Upload a video or photo, then add it to the timeline.</p>
          </div>
        )}
      </div>
    </div>
  );
}
