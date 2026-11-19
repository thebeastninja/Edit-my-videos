# Moicut product plan

**Moicut: Your video. Your cut.** An AI video editor where anyone gets a
great-looking video in minutes: pick a template or upload a reference video,
drop in your clips, tweak anything by clicking or by asking the AI, and export.

- **Launch audience:** short-form creators (TikTok, Reels, Shorts)
- **Domain:** moicut.com

## User journey

```
Home → New video
   ├── Pick a template (gallery with previews)
   └── Upload a reference video → AI builds a matching recipe
        ↓
Add your clips (drag & drop, any common format)
        ↓
Editor: preview + timeline + style panel + AI chat
        ↓
Export MP4 (download, or save to account)
```

## Core idea: every project is a recipe

A project is a list of edits (clips with in/out points, text, music, size), not
a video file. Templates are recipes with blanks. The AI edits the recipe. Export
turns the recipe into the final MP4.

## Milestones

| # | Milestone | Status |
|---|---|---|
| 1 | Editor core: upload, preview, timeline, trim/split/reorder, undo, MP4 export | ✅ Done |
| 2 | Text and music: animated text, music with looping and fade, sizes | ✅ Done (basic) |
| 3 | Template system: 10 templates, gallery, clip effects, overlays, fonts | ✅ Done |
| 4 | Auto-captions: free in-browser Whisper, 5 styles, editable list | ✅ Done (needs a real-device check) |
| 5 | Accounts and saving (Supabase), cloud storage (Cloudflare R2) | Next |
| 6 | Payments (Stripe), landing page, deploy (Vercel) → **launch V1** | |
| 7 | AI chat editing (Claude API edits the recipe) | |
| 8 | Reference-video matching (cut/beat detection + AI vision) | |
| 9 | 25–30 templates, transitions, filters, silence removal → **V2** | |

Later (V3): stock music library, brand kit, direct posting to social apps,
4K export, team accounts.

## Starting templates (25)

| Short-form | YouTube / longer | Business | Fun / niche |
|---|---|---|---|
| Bouncy captions talking-head | Vlog intro | Product showcase | Gaming highlight |
| Fast-cut music montage | Video essay with titles | Testimonial / review | Meme format |
| "Wait for it" reveal | Tutorial with step labels | Real estate tour | Before / after split |
| Day in my life | Podcast clip with waveform | Event promo | Travel montage |
| Top 5 countdown | Reaction split-screen | Sale / discount ad | Fitness transformation |
| Storytime with emoji captions | Chapter-style recap | Logo reveal outro | Quote slideshow |
| Green-screen style | | | Recipe / cooking steps |

## Stack

| Part | Tool |
|---|---|
| App | Next.js, React, Tailwind |
| Video decode/encode | Mediabunny + WebCodecs (in the browser, free to run) |
| Templates and animation | Built-in canvas renderer (same code for preview and export) |
| Server export fallback | FFmpeg / Remotion Lambda |
| AI | Claude API (Haiku for quick edits, larger models for reference analysis) |
| Captions | Whisper running in the browser (Transformers.js), free; a paid API can be a Pro option later |
| Accounts and database | Supabase |
| Storage | Cloudflare R2 |
| Payments | Stripe |
| Hosting | Vercel |

## Running costs (estimates)

- Building and testing: about $0–20/month
- 100 active users: about $50–150/month
- 1,000 active users: about $300–1,500/month, mostly AI and storage
- Video processing and captions run in users' browsers and cost nothing

## Pricing (draft, not final)

| Plan | Price | Includes |
|---|---|---|
| Free | $0 | 720p with watermark, 5 templates, 10 caption minutes/month |
| Creator | $15/mo | 1080p, no watermark, all templates, 120 caption minutes, 50 AI credits |
| Pro | $35/mo | 4K, brand kit, 500 AI credits, reference matching |

## Templates built (milestone 3)

Fast Montage, Wait For It, Cinematic Story, Day in My Life, Top 5 Countdown,
Vintage Memories, Travel Diary, Quote Slideshow, Classic Meme, Product Spotlight.
Each one is a function in `src/lib/templates.ts` that turns the user's clips
into a normal, fully editable project.

## Captions (milestone 4)

Whisper (base model) runs in a Web Worker on the user's device via
Transformers.js. The model (~80 MB) downloads once from Hugging Face and is
cached; the ONNX runtime files are served from our own site (`public/ort`,
copied by `scripts/copy-ort.mjs`). Uses WebGPU when available, WebAssembly
otherwise. Captions are normal text overlays tagged as captions, so they can
be restyled, edited or removed together.

## Known limits

- Preview relies on the browser's own video player. Files it can't play (some
  MKV/AVI codecs) can't be imported yet; a server-side converter will fix this.
- Very long or 4K videos are heavy for phones; server export will be the fallback.
- Projects are not saved yet (milestone 5); refreshing the page loses work.
- The editor works on phones but is designed for desktop first.
- Color filters are not supported by Safari's canvas yet, so they are skipped there.
- Exports with color filters or film grain run at about real-time speed on
  machines without a graphics card.
- Captions have only been tested with a stand-in for the AI model: the model
  host is blocked in the development sandbox. Try it on a real device before launch.
- The first caption run downloads ~80 MB; on old phones transcription is slow.
