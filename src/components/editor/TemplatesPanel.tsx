"use client";

import { useRef } from "react";
import { TEMPLATES, type TemplateDef } from "@/lib/templates";
import TemplateCard from "../TemplateCard";

interface Props {
  hasMedia: boolean;
  pending: TemplateDef | null;
  activeId?: string;
  onUse: (def: TemplateDef) => void;
  onFiles: (files: File[]) => void;
  onCancelPending: () => void;
}

export default function TemplatesPanel({ hasMedia, pending, activeId, onUse, onFiles, onCancelPending }: Props) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="flex h-full flex-col gap-3">
      {pending ? (
        <div className="rounded-xl bg-violet-500/10 p-3 ring-1 ring-violet-400/40">
          <p className="text-sm font-semibold text-white">
            {pending.emoji} {pending.name}
          </p>
          <p className="mt-0.5 text-xs text-white/60">
            Upload your clips and we&apos;ll build the video for you. Works best with {pending.idealClips}
            {pending.idealClips === 1 ? " clip" : " clips"}.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
            >
              Upload clips
            </button>
            <button type="button" onClick={onCancelPending} className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:bg-white/10">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-white/50">
          {hasMedia
            ? "Pick a style. Your clips are dropped in automatically, and everything stays editable."
            : "Pick a style, then upload your clips. Hover to preview."}
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept="video/*,image/*,audio/*,.mkv,.mov,.avi"
        className="hidden"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto pr-1">
        {TEMPLATES.map((def) => (
          <div key={def.id} className={def.id === activeId ? "rounded-xl ring-2 ring-violet-400" : ""}>
            <TemplateCard def={def} onUse={onUse} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
