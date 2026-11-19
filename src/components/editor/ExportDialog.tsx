"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaItem, Project } from "@/lib/types";
import { exportProject, outputSize, type ExportQuality, type ExportResult } from "@/lib/export";
import { formatTime, projectDuration } from "@/lib/timeline";

interface Props {
  project: Project;
  media: Map<string, MediaItem>;
  onClose: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; progress: number; stage: string }
  | { kind: "done"; result: ExportResult; url: string; seconds: number }
  | { kind: "error"; message: string };

export default function ExportDialog({ project, media, onClose }: Props) {
  const [quality, setQuality] = useState<ExportQuality>("1080p");
  const [fps, setFps] = useState(30);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    if (status.kind !== "done") return;
    const url = status.url;
    return () => URL.revokeObjectURL(url);
  }, [status]);

  const start = async () => {
    const controller = new AbortController();
    abort.current = controller;
    const began = performance.now();
    setStatus({ kind: "running", progress: 0, stage: "Starting" });
    try {
      const result = await exportProject(project, media, {
        quality,
        fps,
        signal: controller.signal,
        onProgress: (progress, stage) => setStatus({ kind: "running", progress, stage }),
      });
      setStatus({
        kind: "done",
        result,
        url: URL.createObjectURL(result.blob),
        seconds: (performance.now() - began) / 1000,
      });
    } catch (err) {
      if (controller.signal.aborted) setStatus({ kind: "idle" });
      else setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const size = outputSize(project, quality);
  const duration = projectDuration(project);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-neutral-900 p-6 shadow-2xl ring-1 ring-white/10">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Export video</h2>
            <p className="text-xs text-white/50">
              {formatTime(duration)} · {size.width}×{size.height} · MP4
            </p>
          </div>
          {status.kind !== "running" && (
            <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Close">
              ✕
            </button>
          )}
        </div>

        {(status.kind === "idle" || status.kind === "error") && (
          <div className="space-y-4">
            <Choice label="Quality" value={quality} onChange={setQuality} options={[["720p", "720p · faster"], ["1080p", "1080p · best"]]} />
            <Choice label="Frame rate" value={String(fps)} onChange={(v) => setFps(Number(v))} options={[["24", "24 · cinematic"], ["30", "30 · standard"], ["60", "60 · smooth"]]} />
            {status.kind === "error" && (
              <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300 ring-1 ring-red-500/30">{status.message}</p>
            )}
            <button type="button" onClick={start} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-semibold text-white hover:bg-violet-500">
              Export MP4
            </button>
            <p className="text-center text-[11px] text-white/40">Your video is rendered on this device. Nothing is uploaded.</p>
          </div>
        )}

        {status.kind === "running" && (
          <div className="space-y-4">
            <div className="h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-[width]" style={{ width: `${Math.round(status.progress * 100)}%` }} />
            </div>
            <p className="text-center text-sm text-white/70">
              {status.stage}… {Math.round(status.progress * 100)}%
            </p>
            <button type="button" onClick={() => abort.current?.abort()} className="w-full rounded-xl bg-white/5 py-2.5 text-sm font-semibold text-white ring-1 ring-white/10 hover:bg-white/10">
              Cancel
            </button>
          </div>
        )}

        {status.kind === "done" && (
          <div className="space-y-4">
            <video src={status.url} controls className="max-h-72 w-full rounded-xl bg-black" />
            <p className="text-center text-xs text-white/50">
              Done in {status.seconds.toFixed(1)}s · {(status.result.blob.size / 1e6).toFixed(1)} MB
            </p>
            <a href={status.url} download={status.result.fileName} className="block w-full rounded-xl bg-violet-600 py-3 text-center text-sm font-semibold text-white hover:bg-violet-500">
              Download {status.result.fileName}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function Choice<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium tracking-wide text-white/50 uppercase">{label}</p>
      <div className="flex gap-2">
        {options.map(([v, text]) => (
          <button
            key={v} type="button" onClick={() => onChange(v)}
            className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium ring-1 ${value === v ? "bg-violet-600/30 text-white ring-violet-400" : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
