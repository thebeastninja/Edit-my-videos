"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { MediaItem } from "@/lib/types";
import { IMAGE_DURATION } from "@/lib/types";
import { importFile } from "@/lib/media";
import { initialState, reducer } from "@/lib/store";
import { createPlayback, usePlayback } from "@/lib/playback";
import { formatTime, projectDuration, uid } from "@/lib/timeline";
import Preview from "./Preview";
import Timeline from "./Timeline";
import MediaPanel from "./MediaPanel";
import Inspector from "./Inspector";
import ExportDialog from "./ExportDialog";
import TemplatesPanel from "./TemplatesPanel";
import Logo from "../Logo";
import { applyTemplate, getTemplate, type TemplateDef } from "@/lib/templates";

export default function Editor() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [media, setMedia] = useState<Map<string, MediaItem>>(() => new Map());
  const [importing, setImporting] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<"media" | "templates">("media");
  const [pendingTemplate, setPendingTemplate] = useState<TemplateDef | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const playback = useMemo(createPlayback, []);
  const { time, playing } = usePlayback(playback);
  const { project, selection } = state;
  const duration = projectDuration(project);

  const addToTimeline = useCallback((item: MediaItem) => {
    dispatch({
      type: "addClip",
      clip: {
        id: uid("clip"),
        mediaId: item.id,
        in: 0,
        out: item.kind === "image" ? IMAGE_DURATION : item.duration,
        volume: 1,
      },
    });
  }, []);

  const onFiles = useCallback(
    async (files: File[]) => {
      setImporting((n) => n + files.length);
      const results = await Promise.allSettled(files.map(importFile));
      setImporting((n) => n - files.length);
      const added: MediaItem[] = [];
      const failed: string[] = [];
      for (const r of results) {
        if (r.status === "fulfilled") added.push(r.value);
        else failed.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
      }
      if (failed.length) setErrors((e) => [...e, ...failed]);
      if (!added.length) return;
      setMedia((m) => {
        const next = new Map(m);
        for (const item of added) next.set(item.id, item);
        return next;
      });
      let base = project;
      if (!project.music) {
        const song = added.find((i) => i.kind === "audio");
        if (song) {
          base = { ...base, music: { mediaId: song.id, volume: 0.6 } };
          dispatch({ type: "setMusic", music: base.music });
        }
      }
      const visual = added.filter((i) => i.kind !== "audio");
      if (pendingTemplate && visual.length) {
        // The user picked a template first: build it from everything uploaded so far.
        const all = [...Array.from(media.values()), ...added];
        dispatch({ type: "replaceProject", project: applyTemplate(pendingTemplate, all, base) });
        playback.set({ time: 0 });
        setToast(`${pendingTemplate.emoji} ${pendingTemplate.name} applied. Press play!`);
        setPendingTemplate(null);
      } else if (project.clips.length === 0) {
        // First upload goes straight onto the timeline, so new users see something happen.
        visual.forEach(addToTimeline);
      }
    },
    [project, media, pendingTemplate, playback, addToTimeline],
  );

  const pickTemplate = (def: TemplateDef) => {
    const items = Array.from(media.values());
    if (!items.some((i) => i.kind !== "audio")) {
      setPendingTemplate(def);
      setTab("templates");
      return;
    }
    dispatch({ type: "replaceProject", project: applyTemplate(def, items, project) });
    playback.set({ time: 0, playing: false });
    setToast(`${def.emoji} ${def.name} applied. Undo with Ctrl/⌘+Z.`);
  };

  // Opening /editor?template=… starts with that template picked.
  useEffect(() => {
    const def = getTemplate(new URLSearchParams(window.location.search).get("template"));
    if (def) {
      setPendingTemplate(def);
      setTab("templates");
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  const removeMedia = (item: MediaItem) => {
    project.clips.filter((c) => c.mediaId === item.id).forEach((c) => dispatch({ type: "removeClip", id: c.id }));
    if (project.music?.mediaId === item.id) dispatch({ type: "setMusic", music: null });
    setMedia((m) => {
      const next = new Map(m);
      next.delete(item.id);
      return next;
    });
    URL.revokeObjectURL(item.url);
  };

  const addText = useCallback(() => {
    const t = playback.get().time;
    dispatch({
      type: "addText",
      text: {
        id: uid("text"),
        text: "Your text here",
        start: t,
        end: t + 3,
        x: 0.5,
        y: 0.5,
        size: 0.06,
        color: "#ffffff",
        style: "outline",
        anim: "pop",
      },
    });
  }, [playback]);

  const togglePlay = useCallback(() => {
    const p = playback.get();
    if (p.playing) return playback.set({ playing: false });
    const d = projectDuration(state.project);
    if (d <= 0) return;
    playback.set({ playing: true, time: p.time >= d - 0.05 ? 0 : p.time });
  }, [playback, state.project]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (!mod && e.key.toLowerCase() === "s") {
        dispatch({ type: "splitAt", time: playback.get().time });
      } else if (!mod && e.key.toLowerCase() === "t") {
        addText();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        dispatch({ type: "deleteSelection" });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const step = e.shiftKey ? 1 : 1 / 30;
        const t = playback.get().time + (e.key === "ArrowLeft" ? -step : step);
        playback.set({ time: Math.max(0, Math.min(projectDuration(state.project), t)) });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, addText, playback, state.project]);

  // Keep the playhead inside the video when clips get shorter.
  useEffect(() => {
    if (playback.get().time > duration) playback.set({ time: duration });
  }, [duration, playback]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!project.clips.length) return;
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [project.clips.length]);

  const items = Array.from(media.values());

  return (
    <div className="flex h-dvh flex-col bg-neutral-950 text-white">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <Link href="/" aria-label="Moicut home">
          <Logo />
        </Link>
        <input
          value={project.name}
          onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
          className="ml-2 hidden w-56 rounded-lg bg-transparent px-2 py-1 text-sm text-white/80 outline-none hover:bg-white/5 focus:bg-white/5 sm:block"
          aria-label="Project name"
        />
        <div className="ml-auto flex items-center gap-2">
          <IconBtn label="Undo (⌘Z)" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}>↶</IconBtn>
          <IconBtn label="Redo (⇧⌘Z)" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}>↷</IconBtn>
          <button
            type="button"
            disabled={duration <= 0}
            onClick={() => {
              playback.set({ playing: false });
              setExporting(true);
            }}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-600/30 hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Export
          </button>
        </div>
      </header>

      {errors.length > 0 && (
        <div className="flex items-start gap-3 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          <div className="flex-1 space-y-0.5">{errors.map((e, i) => <p key={i}>{e}</p>)}</div>
          <button type="button" onClick={() => setErrors([])} className="text-red-200/70 hover:text-white" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-2 flex max-h-72 shrink-0 flex-col gap-3 border-white/10 p-3 lg:order-1 lg:max-h-none lg:w-72 lg:border-r">
          <div className="flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10" role="tablist">
            {(["media", "templates"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-md py-1.5 text-xs font-semibold capitalize transition ${
                  tab === t ? "bg-violet-600 text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {t === "media" ? "📁 Media" : "✨ Templates"}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === "media" ? (
              <MediaPanel
                items={items}
                musicId={project.music?.mediaId ?? null}
                onFiles={onFiles}
                onAdd={addToTimeline}
                onSetMusic={(item) => dispatch({ type: "setMusic", music: { mediaId: item.id, volume: 0.6 } })}
                onRemove={removeMedia}
                busy={importing > 0}
              />
            ) : (
              <TemplatesPanel
                hasMedia={items.some((i) => i.kind !== "audio")}
                pending={pendingTemplate}
                activeId={project.templateId}
                onUse={pickTemplate}
                onFiles={onFiles}
                onCancelPending={() => setPendingTemplate(null)}
              />
            )}
          </div>
        </aside>

        <main className="order-1 flex min-h-[280px] min-w-0 flex-1 flex-col lg:order-2">
          <div className="min-h-0 flex-1 p-4">
            <Preview project={project} media={media} playback={playback} selection={selection} dispatch={dispatch} />
          </div>
          {/* Transport */}
          <div className="flex items-center justify-center gap-2 border-t border-white/10 px-3 py-2">
            <ToolBtn onClick={() => playback.set({ time: 0 })} label="Back to start">⏮</ToolBtn>
            <button
              type="button"
              onClick={togglePlay}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-black hover:scale-105"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "❚❚" : "▶"}
            </button>
            <span className="w-28 text-center font-mono text-xs text-white/60 tabular-nums">
              {formatTime(time)} / {formatTime(duration)}
            </span>
            <ToolBtn onClick={() => dispatch({ type: "splitAt", time })} label="Split at playhead (S)">✂️ Split</ToolBtn>
            <ToolBtn onClick={addText} label="Add text (T)">🔤 Text</ToolBtn>
            <ToolBtn onClick={() => dispatch({ type: "deleteSelection" })} label="Delete selected" disabled={!selection}>🗑️</ToolBtn>
          </div>
        </main>

        <aside className="order-3 shrink-0 overflow-y-auto border-white/10 p-4 lg:w-80 lg:border-l">
          <Inspector project={project} media={media} selection={selection} dispatch={dispatch} />
        </aside>
      </div>

      {/* Timeline */}
      <section className="h-48 shrink-0 border-t border-white/10 bg-neutral-950 pt-1" aria-label="Timeline">
        <Timeline project={project} media={media} playback={playback} selection={selection} dispatch={dispatch} />
      </section>

      {exporting && <ExportDialog project={project} media={media} onClose={() => setExporting(false)} />}

      {toast && (
        <div role="status" className="fixed bottom-56 left-1/2 z-40 -translate-x-1/2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function IconBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function ToolBtn({ children, label, onClick, disabled }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={label}
      className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
