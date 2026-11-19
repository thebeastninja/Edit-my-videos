# Moicut

**Your video. Your cut.** An easy, browser-based video editor for creators.

Upload clips, photos and music, trim and arrange them on a timeline, add animated
text, pick a size (TikTok, Reels, Shorts, YouTube, square) and export an MP4.
Everything runs on the user's device: nothing is uploaded, and exporting costs
nothing to host.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build: `npm run build && npm start`.

Needs a recent Chrome, Edge or Safari (export uses WebCodecs). Firefox works too,
using a built-in AAC encoder for the sound.

## How it works

A project is a **recipe**, not a video file (`src/lib/types.ts`): a list of clips
(source file plus in/out points), text overlays, music and an output size. The
preview and the export both draw frames from that recipe with the same renderer
(`src/lib/render.ts`), so what you see is what you get.

| Part | File |
|---|---|
| Project recipe types | `src/lib/types.ts` |
| Editor state, undo/redo | `src/lib/store.ts` |
| Timeline math | `src/lib/timeline.ts` |
| Frame renderer (picture fit, text styles, animations) | `src/lib/render.ts` |
| MP4 export (Mediabunny + WebCodecs, audio mix) | `src/lib/export.ts` |
| File import (duration, size, thumbnails) | `src/lib/media.ts` |
| Editor UI | `src/components/editor/` |

## Keyboard shortcuts

Space play/pause · S split · T add text · Delete remove · ←/→ step a frame
(hold Shift for 1s) · Ctrl/⌘+Z undo · Shift+Ctrl/⌘+Z redo

See [PLAN.md](PLAN.md) for the roadmap.
