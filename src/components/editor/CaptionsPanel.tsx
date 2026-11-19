"use client";

import { useState } from "react";
import type { MediaItem, Project } from "@/lib/types";
import type { Action } from "@/lib/store";
import type { PlaybackStore } from "@/lib/playback";
import { formatTime } from "@/lib/timeline";
import {
  buildCaptions,
  CAPTION_STYLES,
  captionLook,
  LANGUAGES,
  speechAudio,
  transcribe,
  type CaptionLength,
  type CaptionPosition,
  type CaptionProgress,
  type CaptionStyleId,
  type Word,
} from "@/lib/captions";

interface Props {
  project: Project;
  media: Map<string, MediaItem>;
  playback: PlaybackStore;
  dispatch: (a: Action) => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "working"; progress: CaptionProgress }
  | { kind: "error"; message: string };

const PREVIEW_CLASS: Record<CaptionStyleId, string> = {
  pop: "font-[family-name:var(--font-anton)] text-white [-webkit-text-stroke:1px_black] uppercase",
  highlight: "font-extrabold text-black bg-yellow-400 rounded px-1",
  clean: "font-bold text-white drop-shadow",
  neon: "font-extrabold text-lime-400 [-webkit-text-stroke:0.5px_black] uppercase",
  boxed: "font-bold text-white bg-black/80 rounded px-1",
};

export default function CaptionsPanel({ project, media, playback, dispatch }: Props) {
  const [language, setLanguage] = useState("");
  const [style, setStyle] = useState<CaptionStyleId>("pop");
  const [length, setLength] = useState<CaptionLength>("punchy");
  const [position, setPosition] = useState<CaptionPosition>("bottom");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [words, setWords] = useState<Word[] | null>(null);

  const captions = project.texts.filter((t) => t.group === "caption").sort((a, b) => a.start - b.start);
  const hasSpeech = project.clips.some((c) => {
    const m = media.get(c.mediaId);
    return m?.kind === "video" && m.hasAudio;
  });

  const generate = async () => {
    setStatus({ kind: "working", progress: { stage: "audio" } });
    try {
      const audio = await speechAudio(project, media);
      if (!audio) throw new Error("None of the clips on your timeline have sound.");
      const { words: found } = await transcribe(audio, language || null, (progress) =>
        setStatus({ kind: "working", progress }),
      );
      if (!found.length) throw new Error("No speech was found in your clips.");
      setWords(found);
      dispatch({ type: "setCaptions", captions: buildCaptions(found, style, length, position) });
      setStatus({ kind: "idle" });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  // Changing the look restyles existing captions right away.
  const restyle = (s: CaptionStyleId, pos: CaptionPosition) => {
    if (!captions.length) return;
    dispatch({ type: "styleCaptions", patch: captionLook(s, pos), uppercase: CAPTION_STYLES[s].uppercase });
  };
  // Changing the length needs the words again, which we keep from the last run.
  const regroup = (l: CaptionLength) => {
    if (words) dispatch({ type: "setCaptions", captions: buildCaptions(words, style, l, position) });
  };

  const working = status.kind === "working";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1">
      <p className="text-xs text-white/50">
        Turns speech in your clips into animated captions. Runs on your device: free and private.
      </p>

      <Group label="Look">
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(CAPTION_STYLES) as CaptionStyleId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setStyle(id);
                restyle(id, position);
              }}
              className={`flex h-12 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 text-[11px] ring-2 transition ${
                style === id ? "ring-violet-400" : "ring-transparent hover:ring-white/30"
              }`}
            >
              <span className={`text-sm leading-none ${PREVIEW_CLASS[id]}`}>Hello</span>
              <span className="mt-1 text-[10px] text-white/60">{CAPTION_STYLES[id].label}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group label="Words per caption">
        <Seg
          value={length}
          options={[["punchy", "Punchy (1–3)"], ["sentence", "Full lines"]]}
          onChange={(l) => {
            setLength(l);
            regroup(l);
          }}
        />
      </Group>

      <Group label="Position">
        <Seg
          value={position}
          options={[["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]]}
          onChange={(p) => {
            setPosition(p);
            restyle(style, p);
          }}
        />
      </Group>

      <Group label="Spoken language">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-violet-500"
        >
          {LANGUAGES.map(([v, label]) => (
            <option key={v} value={v} className="bg-neutral-900">
              {label}
            </option>
          ))}
        </select>
      </Group>

      <button
        type="button"
        disabled={working || !hasSpeech}
        onClick={generate}
        className="rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {working ? "Working…" : captions.length ? "↻ Redo captions" : "✨ Auto-caption"}
      </button>
      {!hasSpeech && <p className="text-center text-[11px] text-white/40">Add a video with sound to the timeline first.</p>}

      {working && <ProgressLine progress={status.progress} />}
      {status.kind === "error" && (
        <p className="rounded-lg bg-red-500/10 p-2 text-xs text-red-300 ring-1 ring-red-500/30">{status.message}</p>
      )}

      {captions.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium tracking-wide text-white/50 uppercase">{captions.length} captions</span>
            <button
              type="button"
              onClick={() => dispatch({ type: "setCaptions", captions: [] })}
              className="text-[11px] text-red-300/80 hover:text-red-300"
            >
              Remove all
            </button>
          </div>
          {captions.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  // Land just after the entrance animation so the caption is fully visible.
                  playback.set({ time: c.start + Math.min(0.4, (c.end - c.start) / 2), playing: false });
                  dispatch({ type: "select", selection: { kind: "text", id: c.id } });
                }}
                className="w-11 shrink-0 rounded bg-white/5 py-1 text-center font-mono text-[10px] text-white/60 hover:bg-white/10"
                title="Jump to this caption"
              >
                {formatTime(c.start)}
              </button>
              <input
                value={c.text}
                onChange={(e) => dispatch({ type: "updateText", id: c.id, patch: { text: e.target.value } })}
                className="min-w-0 flex-1 rounded bg-white/5 px-2 py-1 text-xs text-white ring-1 ring-white/10 outline-none focus:ring-violet-500"
                aria-label={`Caption at ${formatTime(c.start)}`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressLine({ progress }: { progress: CaptionProgress }) {
  const text =
    progress.stage === "audio"
      ? "Getting the audio from your clips…"
      : progress.stage === "load"
        ? "Starting the speech AI…"
        : progress.stage === "download"
          ? `Downloading the speech AI (first time only)… ${Math.round(progress.progress * 100)}%`
          : "Listening to your video… this can take a minute.";
  const pct = progress.stage === "download" ? progress.progress * 100 : null;
  return (
    <div className="space-y-1.5">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        {pct === null ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-violet-500" />
        ) : (
          <div className="h-full rounded-full bg-violet-500 transition-[width]" style={{ width: `${pct}%` }} />
        )}
      </div>
      <p className="text-[11px] text-white/60">{text}</p>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5" role="group" aria-label={label}>
      <span className="text-[11px] font-medium tracking-wide text-white/50 uppercase">{label}</span>
      {children}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${value === v ? "bg-violet-600 text-white" : "text-white/60 hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
