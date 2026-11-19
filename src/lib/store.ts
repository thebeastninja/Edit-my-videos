import type { AspectRatio, Clip, FitMode, MusicTrack, Overlays, Project, TextOverlay } from "./types";
import { clipAt, clipLength, layoutClips, uid } from "./timeline";

export type Selection =
  | { kind: "clip"; id: string }
  | { kind: "text"; id: string }
  | { kind: "music" }
  | null;

export interface EditorState {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection;
}

export type Action =
  | { type: "addClip"; clip: Clip }
  | { type: "updateClip"; id: string; patch: Partial<Clip>; commit?: boolean }
  | { type: "removeClip"; id: string }
  | { type: "moveClip"; id: string; to: number }
  | { type: "splitAt"; time: number }
  | { type: "duplicateClip"; id: string }
  | { type: "addText"; text: TextOverlay }
  | { type: "updateText"; id: string; patch: Partial<TextOverlay>; commit?: boolean }
  | { type: "removeText"; id: string }
  | { type: "setMusic"; music: MusicTrack | null }
  | { type: "setAspect"; aspect: AspectRatio }
  | { type: "setFit"; fit: FitMode }
  | { type: "rename"; name: string }
  | { type: "setOverlays"; patch: Partial<Overlays> }
  | { type: "setCaptions"; captions: TextOverlay[] }
  | { type: "styleCaptions"; patch: Partial<TextOverlay>; uppercase?: boolean }
  | { type: "replaceProject"; project: Project }
  | { type: "select"; selection: Selection }
  | { type: "deleteSelection" }
  | { type: "checkpoint" }
  | { type: "undo" }
  | { type: "redo" };

export const emptyProject = (): Project => ({
  name: "Untitled video",
  aspect: "9:16",
  fit: "fill",
  clips: [],
  texts: [],
  music: null,
});

export const initialState = (): EditorState => ({
  project: emptyProject(),
  past: [],
  future: [],
  selection: null,
});

const HISTORY = 100;

/** Applies a change and records the previous version for undo. */
function commit(state: EditorState, project: Project, selection = state.selection): EditorState {
  if (project === state.project) return { ...state, selection };
  return {
    project,
    past: [...state.past, state.project].slice(-HISTORY),
    future: [],
    selection,
  };
}

/** Applies a change without an undo step (used while dragging). */
const live = (state: EditorState, project: Project): EditorState => ({ ...state, project });

export function reducer(state: EditorState, action: Action): EditorState {
  const p = state.project;
  switch (action.type) {
    case "addClip":
      return commit(state, { ...p, clips: [...p.clips, action.clip] }, { kind: "clip", id: action.clip.id });

    case "updateClip": {
      const clips = p.clips.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c));
      const next = { ...p, clips };
      return action.commit === false ? live(state, next) : commit(state, next);
    }

    case "removeClip":
      return commit(
        state,
        { ...p, clips: p.clips.filter((c) => c.id !== action.id) },
        state.selection?.kind === "clip" && state.selection.id === action.id ? null : state.selection,
      );

    case "moveClip": {
      const from = p.clips.findIndex((c) => c.id === action.id);
      if (from < 0) return state;
      const to = Math.max(0, Math.min(p.clips.length - 1, action.to));
      if (from === to) return state;
      const clips = [...p.clips];
      const [c] = clips.splice(from, 1);
      clips.splice(to, 0, c);
      return commit(state, { ...p, clips });
    }

    case "splitAt": {
      const hit = clipAt(p.clips, action.time);
      if (!hit) return state;
      const { clip, index } = hit.placed;
      const cut = hit.sourceTime;
      const MIN = 0.1;
      if (cut - clip.in < MIN || clip.out - cut < MIN) return state;
      const left = { ...clip, out: cut };
      const right = { ...clip, id: uid("clip"), in: cut };
      const clips = [...p.clips];
      clips.splice(index, 1, left, right);
      return commit(state, { ...p, clips }, { kind: "clip", id: right.id });
    }

    case "duplicateClip": {
      const i = p.clips.findIndex((c) => c.id === action.id);
      if (i < 0) return state;
      const copy = { ...p.clips[i], id: uid("clip") };
      const clips = [...p.clips];
      clips.splice(i + 1, 0, copy);
      return commit(state, { ...p, clips }, { kind: "clip", id: copy.id });
    }

    case "addText":
      return commit(state, { ...p, texts: [...p.texts, action.text] }, { kind: "text", id: action.text.id });

    case "updateText": {
      const texts = p.texts.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t));
      const next = { ...p, texts };
      return action.commit === false ? live(state, next) : commit(state, next);
    }

    case "removeText":
      return commit(
        state,
        { ...p, texts: p.texts.filter((t) => t.id !== action.id) },
        state.selection?.kind === "text" && state.selection.id === action.id ? null : state.selection,
      );

    case "setMusic":
      return commit(state, { ...p, music: action.music }, action.music ? { kind: "music" } : null);

    case "setAspect":
      return commit(state, { ...p, aspect: action.aspect });

    case "setFit":
      return commit(state, { ...p, fit: action.fit });

    case "rename":
      return commit(state, { ...p, name: action.name });

    case "setOverlays":
      return commit(state, { ...p, overlays: { ...p.overlays, ...action.patch } });

    case "setCaptions":
      // Replaces any earlier auto-captions; hand-made text is kept.
      return commit(
        state,
        { ...p, texts: [...p.texts.filter((t) => t.group !== "caption"), ...action.captions] },
        null,
      );

    case "styleCaptions": {
      const texts = p.texts.map((t) => {
        if (t.group !== "caption") return t;
        const next = { ...t, ...action.patch };
        if (action.uppercase === true) next.text = next.text.toUpperCase();
        else if (action.uppercase === false && t.text === t.text.toUpperCase()) {
          // Back to sentence case: lower-case everything, capitalise the first letter.
          const lower = t.text.toLowerCase();
          next.text = lower.charAt(0).toUpperCase() + lower.slice(1);
        }
        return next;
      });
      return commit(state, { ...p, texts });
    }

    case "replaceProject":
      // Used by templates: one undo step brings back the previous edit.
      return commit(state, action.project, null);

    case "select":
      return { ...state, selection: action.selection };

    case "deleteSelection": {
      const s = state.selection;
      if (!s) return state;
      if (s.kind === "clip") return reducer(state, { type: "removeClip", id: s.id });
      if (s.kind === "text") return reducer(state, { type: "removeText", id: s.id });
      return reducer(state, { type: "setMusic", music: null });
    }

    case "checkpoint":
      // Called before a drag starts, so the whole drag becomes one undo step.
      return { ...state, past: [...state.past, p].slice(-HISTORY), future: [] };

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { ...state, project: prev, past: state.past.slice(0, -1), future: [p, ...state.future] };
    }

    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return { ...state, project: next, past: [...state.past, p], future: rest };
    }
  }
}

export { clipLength, layoutClips };
