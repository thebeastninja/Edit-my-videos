"use client";

import { useRef, useState } from "react";
import type { MediaItem, Project } from "@/lib/types";
import { IMAGE_DURATION } from "@/lib/types";
import { formatTime, layoutClips, projectDuration } from "@/lib/timeline";
import { usePlayback, type PlaybackStore } from "@/lib/playback";
import type { Action, Selection } from "@/lib/store";

interface Props {
  project: Project;
  media: Map<string, MediaItem>;
  playback: PlaybackStore;
  selection: Selection;
  dispatch: (a: Action) => void;
}

const LABEL_W = 56;
const MIN_CLIP = 0.1;

type Drag =
  | { kind: "trim-in" | "trim-out"; id: string; startX: number; orig: { in: number; out: number }; max: number }
  | { kind: "reorder"; id: string; startX: number; moved: boolean }
  | { kind: "text-move" | "text-start" | "text-end"; id: string; startX: number; orig: { start: number; end: number } }
  | { kind: "seek" };

export default function Timeline({ project, media, playback, selection, dispatch }: Props) {
  const [zoom, setZoom] = useState(60); // pixels per second
  const [dragX, setDragX] = useState<{ id: string; dx: number } | null>(null);
  const drag = useRef<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const { time } = usePlayback(playback);

  const duration = projectDuration(project);
  const placed = layoutClips(project.clips);
  const width = Math.max(duration + 5, 15) * zoom;

  const timeFromEvent = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - LABEL_W + el.scrollLeft) / zoom);
  };

  const seek = (clientX: number) => {
    playback.set({ time: Math.min(timeFromEvent(clientX), duration) });
  };

  const begin = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation();
    if (d.kind !== "seek" && d.kind !== "reorder") dispatch({ type: "checkpoint" });
    drag.current = d;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "seek") return seek(e.clientX);
    const dt = (e.clientX - d.startX) / zoom;

    if (d.kind === "trim-in") {
      const v = Math.max(0, Math.min(d.orig.out - MIN_CLIP, d.orig.in + dt));
      dispatch({ type: "updateClip", id: d.id, patch: { in: v }, commit: false });
    } else if (d.kind === "trim-out") {
      const v = Math.max(d.orig.in + MIN_CLIP, Math.min(d.max, d.orig.out + dt));
      dispatch({ type: "updateClip", id: d.id, patch: { out: v }, commit: false });
    } else if (d.kind === "reorder") {
      if (Math.abs(e.clientX - d.startX) > 4) d.moved = true;
      if (d.moved) setDragX({ id: d.id, dx: e.clientX - d.startX });
    } else if (d.kind === "text-move") {
      const len = d.orig.end - d.orig.start;
      const s = Math.max(0, d.orig.start + dt);
      dispatch({ type: "updateText", id: d.id, patch: { start: s, end: s + len }, commit: false });
    } else if (d.kind === "text-start") {
      const s = Math.max(0, Math.min(d.orig.end - MIN_CLIP, d.orig.start + dt));
      dispatch({ type: "updateText", id: d.id, patch: { start: s }, commit: false });
    } else if (d.kind === "text-end") {
      const en = Math.max(d.orig.start + MIN_CLIP, d.orig.end + dt);
      dispatch({ type: "updateText", id: d.id, patch: { end: en }, commit: false });
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "reorder" && d.moved) {
      // Drop the clip where its centre ends up.
      const p = placed.find((x) => x.clip.id === d.id)!;
      const centre = (p.start + p.end) / 2 + (e.clientX - d.startX) / zoom;
      let to = placed.findIndex((x) => centre < (x.start + x.end) / 2);
      if (to === -1) to = placed.length - 1;
      else if (to > p.index) to -= 1;
      dispatch({ type: "moveClip", id: d.id, to });
    }
    setDragX(null);
  };

  // Ruler ticks: pick a spacing that keeps labels readable at any zoom.
  const step = [0.5, 1, 2, 5, 10, 15, 30, 60].find((s) => s * zoom >= 70) ?? 120;
  const ticks = Array.from({ length: Math.ceil(width / zoom / step) + 1 }, (_, i) => i * step);

  const musicItem = project.music ? media.get(project.music.mediaId) : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end gap-2 px-3 pb-1 text-xs text-white/50">
        <span>Zoom</span>
        <input
          type="range"
          min={15}
          max={240}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-28 accent-violet-500"
          aria-label="Timeline zoom"
        />
      </div>
      <div
        ref={scroller}
        className="relative flex-1 overflow-x-auto overflow-y-hidden select-none"
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <div className="relative" style={{ width: width + LABEL_W, minWidth: "100%" }}>
          {/* Ruler */}
          <div
            className="sticky top-0 z-10 h-6 cursor-pointer border-b border-white/10 bg-neutral-950"
            style={{ marginLeft: LABEL_W }}
            onPointerDown={(e) => {
              begin(e, { kind: "seek" });
              seek(e.clientX);
            }}
          >
            {ticks.map((t) => (
              <div key={t} className="absolute top-0 h-full border-l border-white/15 pl-1 text-[10px] leading-6 text-white/40" style={{ left: t * zoom }}>
                {formatTime(t)}
              </div>
            ))}
          </div>

          {/* Video track */}
          <Row label="🎞️" hint="Clips">
            {placed.map(({ clip, start, end }) => {
              const item = media.get(clip.mediaId);
              const selected = selection?.kind === "clip" && selection.id === clip.id;
              const max = item?.kind === "video" ? item.duration : Math.max(clip.out, IMAGE_DURATION) + 600;
              const dx = dragX?.id === clip.id ? dragX.dx : 0;
              return (
                <div
                  key={clip.id}
                  className={`group absolute top-1 bottom-1 overflow-hidden rounded-lg ring-2 transition-shadow ${
                    selected ? "z-20 ring-violet-400" : "ring-transparent hover:ring-white/30"
                  } ${dx ? "z-30 opacity-80 shadow-xl" : ""}`}
                  style={{
                    left: start * zoom + dx,
                    width: Math.max(4, (end - start) * zoom - 2),
                    backgroundImage: item?.thumbnail ? `url(${item.thumbnail})` : undefined,
                    backgroundSize: "auto 100%",
                    backgroundRepeat: "repeat-x",
                    backgroundColor: "#4c1d95",
                  }}
                  onPointerDown={(e) => {
                    dispatch({ type: "select", selection: { kind: "clip", id: clip.id } });
                    begin(e, { kind: "reorder", id: clip.id, startX: e.clientX, moved: false });
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  <span className="absolute bottom-1 left-3 right-3 truncate text-[11px] font-medium text-white">
                    {item?.name ?? "Missing media"} · {(end - start).toFixed(1)}s
                  </span>
                  <Handle side="left" onPointerDown={(e) => begin(e, { kind: "trim-in", id: clip.id, startX: e.clientX, orig: { in: clip.in, out: clip.out }, max })} />
                  <Handle side="right" onPointerDown={(e) => begin(e, { kind: "trim-out", id: clip.id, startX: e.clientX, orig: { in: clip.in, out: clip.out }, max })} />
                </div>
              );
            })}
          </Row>

          {/* Text track */}
          <Row label="🔤" hint="Text" small>
            {project.texts.map((t) => {
              const selected = selection?.kind === "text" && selection.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`absolute top-1 bottom-1 cursor-grab overflow-hidden rounded-md bg-amber-500/90 ring-2 active:cursor-grabbing ${
                    selected ? "z-20 ring-white" : "ring-transparent hover:ring-white/40"
                  }`}
                  style={{ left: t.start * zoom, width: Math.max(6, (t.end - t.start) * zoom - 2) }}
                  onPointerDown={(e) => {
                    dispatch({ type: "select", selection: { kind: "text", id: t.id } });
                    begin(e, { kind: "text-move", id: t.id, startX: e.clientX, orig: { start: t.start, end: t.end } });
                  }}
                >
                  <span className="block truncate px-3 text-[11px] font-semibold leading-7 text-black">{t.text || "Text"}</span>
                  <Handle side="left" onPointerDown={(e) => begin(e, { kind: "text-start", id: t.id, startX: e.clientX, orig: { start: t.start, end: t.end } })} />
                  <Handle side="right" onPointerDown={(e) => begin(e, { kind: "text-end", id: t.id, startX: e.clientX, orig: { start: t.start, end: t.end } })} />
                </div>
              );
            })}
          </Row>

          {/* Music track */}
          <Row label="🎵" hint="Music" small>
            {musicItem && project.music && (
              <div
                className={`absolute top-1 bottom-1 left-0 cursor-pointer overflow-hidden rounded-md bg-emerald-600/80 ring-2 ${
                  selection?.kind === "music" ? "ring-white" : "ring-transparent hover:ring-white/40"
                }`}
                style={{ width: Math.max(duration, 1) * zoom }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  dispatch({ type: "select", selection: { kind: "music" } });
                }}
              >
                <span className="block truncate px-3 text-[11px] font-semibold leading-7 text-white">
                  {musicItem.name} · {Math.round(project.music.volume * 100)}%
                </span>
              </div>
            )}
          </Row>

          {/* Playhead */}
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-40 w-px bg-red-500"
            style={{ left: LABEL_W + time * zoom }}
          >
            <div className="absolute -top-0.5 -left-1.5 h-3 w-3 rotate-45 rounded-sm bg-red-500" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, small, children }: { label: string; hint: string; small?: boolean; children: React.ReactNode }) {
  return (
    <div className={`relative flex border-b border-white/5 ${small ? "h-9" : "h-16"}`}>
      <div
        className="sticky left-0 z-30 flex shrink-0 items-center justify-center border-r border-white/10 bg-neutral-950 text-base"
        style={{ width: LABEL_W }}
        title={hint}
      >
        {label}
      </div>
      <div className="relative flex-1">{children}</div>
    </div>
  );
}

function Handle({ side, onPointerDown }: { side: "left" | "right"; onPointerDown: (e: React.PointerEvent) => void }) {
  return (
    <div
      onPointerDown={onPointerDown}
      className={`absolute top-0 bottom-0 z-10 w-2.5 cursor-ew-resize bg-white/0 hover:bg-white/80 group-hover:bg-white/40 ${
        side === "left" ? "left-0 rounded-l-lg" : "right-0 rounded-r-lg"
      }`}
      title="Drag to trim"
    />
  );
}
