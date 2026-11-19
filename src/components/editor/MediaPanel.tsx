"use client";

import { useRef, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { formatTime } from "@/lib/timeline";

interface Props {
  items: MediaItem[];
  musicId: string | null;
  onFiles: (files: File[]) => void;
  onAdd: (item: MediaItem) => void;
  onSetMusic: (item: MediaItem) => void;
  onRemove: (item: MediaItem) => void;
  busy: boolean;
}

export default function MediaPanel({ items, musicId, onFiles, onAdd, onSetMusic, onRemove, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div className="flex h-full flex-col gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition ${
          over ? "border-violet-400 bg-violet-500/10" : "border-white/15 hover:border-white/30 hover:bg-white/5"
        }`}
      >
        <span className="text-2xl">{busy ? "⏳" : "⬆️"}</span>
        <span className="text-sm font-semibold text-white">{busy ? "Importing…" : "Upload media"}</span>
        <span className="text-xs text-white/50">Videos, photos or music. Drag &amp; drop works too.</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept="video/*,audio/*,image/*,.mkv,.mov,.avi"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 && (
          <p className="px-1 pt-4 text-center text-xs text-white/40">Your uploads will appear here.</p>
        )}
        {items.map((item) => (
          <div key={item.id} className="group flex items-center gap-3 rounded-xl bg-white/5 p-2 ring-1 ring-white/5 hover:bg-white/10">
            <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-black/60 text-xl">
              {item.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnail} alt="" className="h-full w-full object-cover" />
              ) : (
                "🎵"
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white" title={item.name}>{item.name}</p>
              <p className="text-[11px] text-white/40">
                {item.kind === "image" ? "Photo" : formatTime(item.duration)}
                {item.kind === "video" && ` · ${item.width}×${item.height}`}
              </p>
              <div className="mt-1 flex gap-1 whitespace-nowrap">
                {item.kind !== "audio" && (
                  <button type="button" onClick={() => onAdd(item)} className="rounded-md bg-violet-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-violet-500">
                    + Timeline
                  </button>
                )}
                {item.kind !== "image" && (
                  <button
                    type="button"
                    onClick={() => onSetMusic(item)}
                    className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                      musicId === item.id ? "bg-emerald-600 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
                    }`}
                  >
                    {musicId === item.id ? "♪ Music" : "Use as music"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(item)}
                  className="ml-auto rounded-md px-1.5 py-0.5 text-[11px] text-white/40 opacity-0 hover:bg-red-500/20 hover:text-red-300 group-hover:opacity-100"
                  aria-label={`Remove ${item.name}`}
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
