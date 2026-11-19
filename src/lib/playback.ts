"use client";

import { useSyncExternalStore } from "react";

/**
 * A tiny store for the playhead, kept outside React state so the playhead can
 * move 60 times a second without re-rendering the whole editor.
 */
export interface Playback {
  time: number;
  playing: boolean;
}

export function createPlayback() {
  let state: Playback = { time: 0, playing: false };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch: Partial<Playback>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export type PlaybackStore = ReturnType<typeof createPlayback>;

export function usePlayback(store: PlaybackStore): Playback {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
