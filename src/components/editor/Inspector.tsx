"use client";

import type { AspectRatio, MediaItem, Project, TextAnim, TextStyle } from "@/lib/types";
import { ASPECTS } from "@/lib/types";
import type { Action, Selection } from "@/lib/store";
import { formatTime } from "@/lib/timeline";

interface Props {
  project: Project;
  media: Map<string, MediaItem>;
  selection: Selection;
  dispatch: (a: Action) => void;
}

const COLORS = ["#ffffff", "#facc15", "#f472b6", "#a78bfa", "#34d399", "#60a5fa", "#f87171", "#111111"];

export default function Inspector({ project, media, selection, dispatch }: Props) {
  if (selection?.kind === "clip") {
    const clip = project.clips.find((c) => c.id === selection.id);
    const item = clip && media.get(clip.mediaId);
    if (clip && item) {
      const maxOut = item.kind === "video" ? item.duration : 600;
      return (
        <Panel title={item.kind === "image" ? "Photo clip" : "Video clip"} subtitle={item.name}>
          <Field label={`Start in source · ${formatTime(clip.in)}`}>
            <input
              type="range" min={0} max={Math.max(0, clip.out - 0.1)} step={0.05} value={clip.in}
              onChange={(e) => dispatch({ type: "updateClip", id: clip.id, patch: { in: Number(e.target.value) } })}
              className="w-full accent-violet-500"
            />
          </Field>
          <Field label={item.kind === "image" ? `Duration · ${(clip.out - clip.in).toFixed(1)}s` : `End in source · ${formatTime(clip.out)}`}>
            {item.kind === "image" ? (
              <input
                type="range" min={0.5} max={15} step={0.1} value={clip.out - clip.in}
                onChange={(e) => dispatch({ type: "updateClip", id: clip.id, patch: { out: clip.in + Number(e.target.value) } })}
                className="w-full accent-violet-500"
              />
            ) : (
              <input
                type="range" min={clip.in + 0.1} max={maxOut} step={0.05} value={clip.out}
                onChange={(e) => dispatch({ type: "updateClip", id: clip.id, patch: { out: Number(e.target.value) } })}
                className="w-full accent-violet-500"
              />
            )}
          </Field>
          {item.kind === "video" && (
            <Field label={`Volume · ${Math.round(clip.volume * 100)}%`}>
              <input
                type="range" min={0} max={1} step={0.01} value={clip.volume}
                onChange={(e) => dispatch({ type: "updateClip", id: clip.id, patch: { volume: Number(e.target.value) } })}
                className="w-full accent-violet-500"
              />
            </Field>
          )}
          <div className="flex gap-2">
            <Btn onClick={() => dispatch({ type: "duplicateClip", id: clip.id })}>Duplicate</Btn>
            <Btn danger onClick={() => dispatch({ type: "removeClip", id: clip.id })}>Delete</Btn>
          </div>
        </Panel>
      );
    }
  }

  if (selection?.kind === "text") {
    const t = project.texts.find((x) => x.id === selection.id);
    if (t) {
      const up = (patch: Partial<typeof t>) => dispatch({ type: "updateText", id: t.id, patch });
      return (
        <Panel title="Text" subtitle="Drag it on the video to move it">
          <textarea
            value={t.text}
            onChange={(e) => up({ text: e.target.value })}
            rows={3}
            className="w-full resize-none rounded-lg bg-white/5 p-2 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-violet-500"
            placeholder="Type something…"
          />
          <Field label="Style">
            <Segmented<TextStyle>
              value={t.style}
              options={[["bold", "Shadow"], ["outline", "Outline"], ["box", "Box"]]}
              onChange={(style) => up({ style })}
            />
          </Field>
          <Field label="Animation">
            <Segmented<TextAnim>
              value={t.anim}
              options={[["none", "None"], ["fade", "Fade"], ["pop", "Pop"], ["slide", "Slide"]]}
              onChange={(anim) => up({ anim })}
            />
          </Field>
          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c} type="button" onClick={() => up({ color: c })} aria-label={`Color ${c}`}
                  className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-neutral-900 ${t.color === c ? "ring-violet-400" : "ring-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <input type="color" value={t.color} onChange={(e) => up({ color: e.target.value })} className="h-7 w-7 cursor-pointer rounded-full bg-transparent" aria-label="Custom color" />
            </div>
          </Field>
          <Field label={`Size · ${Math.round(t.size * 1000)}`}>
            <input type="range" min={0.02} max={0.14} step={0.002} value={t.size} onChange={(e) => up({ size: Number(e.target.value) })} className="w-full accent-violet-500" />
          </Field>
          <Field label="Position">
            <div className="flex gap-2">
              <Btn onClick={() => up({ x: 0.5, y: 0.15 })}>Top</Btn>
              <Btn onClick={() => up({ x: 0.5, y: 0.5 })}>Middle</Btn>
              <Btn onClick={() => up({ x: 0.5, y: 0.78 })}>Bottom</Btn>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Starts (s)">
              <NumberInput value={t.start} onChange={(v) => up({ start: Math.max(0, Math.min(v, t.end - 0.1)) })} />
            </Field>
            <Field label="Ends (s)">
              <NumberInput value={t.end} onChange={(v) => up({ end: Math.max(t.start + 0.1, v) })} />
            </Field>
          </div>
          <Btn danger onClick={() => dispatch({ type: "removeText", id: t.id })}>Delete text</Btn>
        </Panel>
      );
    }
  }

  if (selection?.kind === "music" && project.music) {
    const m = project.music;
    const item = media.get(m.mediaId);
    return (
      <Panel title="Background music" subtitle={item?.name}>
        <Field label={`Volume · ${Math.round(m.volume * 100)}%`}>
          <input
            type="range" min={0} max={1} step={0.01} value={m.volume}
            onChange={(e) => dispatch({ type: "setMusic", music: { ...m, volume: Number(e.target.value) } })}
            className="w-full accent-emerald-500"
          />
        </Field>
        <p className="text-xs text-white/50">Music loops if it&apos;s shorter than your video, and fades out at the end.</p>
        <Btn danger onClick={() => dispatch({ type: "setMusic", music: null })}>Remove music</Btn>
      </Panel>
    );
  }

  return (
    <Panel title="Video settings" subtitle="Select a clip or text to edit it">
      <Field label="Name">
        <input
          value={project.name}
          onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
          className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-violet-500"
        />
      </Field>
      <Field label="Size">
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ASPECTS) as AspectRatio[]).map((a) => (
            <button
              key={a} type="button" onClick={() => dispatch({ type: "setAspect", aspect: a })}
              className={`rounded-lg p-2 text-left ring-1 transition ${project.aspect === a ? "bg-violet-600/30 ring-violet-400" : "bg-white/5 ring-white/10 hover:bg-white/10"}`}
            >
              <div className="text-sm font-semibold text-white">{a}</div>
              <div className="text-[10px] leading-tight text-white/50">{ASPECTS[a].label}</div>
            </button>
          ))}
        </div>
      </Field>
      <Field label="When a clip doesn't match the size">
        <Segmented
          value={project.fit}
          options={[["fill", "Fill (crop)"], ["fit", "Fit (blur sides)"]]}
          onChange={(fit) => dispatch({ type: "setFit", fit })}
        />
      </Field>
      <div className="rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/60">
        <p className="mb-1 font-semibold text-white/80">Shortcuts</p>
        <p>Space play/pause · S split · Delete remove</p>
        <p>⌘/Ctrl+Z undo · ⇧+⌘/Ctrl+Z redo · T add text</p>
      </div>
    </Panel>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {subtitle && <p className="truncate text-xs text-white/50">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-medium tracking-wide text-white/50 uppercase">{label}</span>
      {children}
    </label>
  );
}

function Btn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
        danger ? "bg-red-500/10 text-red-300 ring-red-500/30 hover:bg-red-500/20" : "bg-white/5 text-white ring-white/10 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
      {options.map(([v, label]) => (
        <button
          key={v} type="button" onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${value === v ? "bg-violet-600 text-white" : "text-white/60 hover:text-white"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" step={0.1} min={0} value={Number(value.toFixed(2))}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-sm text-white ring-1 ring-white/10 outline-none focus:ring-violet-500"
    />
  );
}
