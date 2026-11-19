import Link from "next/link";
import Logo from "@/components/Logo";

const features = [
  { icon: "✂️", title: "Cut, trim & split", body: "Drag the edges of a clip to trim it. Split anywhere with one key." },
  { icon: "🔤", title: "Text that pops", body: "Bold captions with outline, shadow or box styles and smooth animations." },
  { icon: "🎵", title: "Music in one click", body: "Drop in a song. It loops, mixes with your clips and fades out for you." },
  { icon: "📱", title: "Every size", body: "TikTok, Reels, Shorts, YouTube or square. Switch any time, nothing breaks." },
  { icon: "⚡", title: "Private & fast", body: "Your videos never leave your device. Export renders right in your browser." },
  { icon: "✨", title: "AI & templates", body: "Coming soon: templates, auto-captions and edit-by-chat. Just say the vibe." },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.35),transparent_65%)]" />
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <Link href="/editor" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15">
          Open editor
        </Link>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <section className="flex flex-col items-center py-20 text-center sm:py-28">
          <span className="mb-6 rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-200 ring-1 ring-violet-400/30">
            Free while in beta
          </span>
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-6xl">
            Your video.{" "}
            <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">Your cut.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-white/60 sm:text-lg">
            Moicut is the easiest way to turn your clips into scroll-stopping videos. Trim, add text and music, and export in minutes.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/editor"
              className="rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-7 py-3.5 text-base font-semibold shadow-xl shadow-violet-600/30 hover:brightness-110"
            >
              Start editing, it&apos;s free
            </Link>
          </div>
          <p className="mt-4 text-xs text-white/40">No sign-up. Works with MP4, MOV, WebM and more.</p>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white/[0.04] p-6 ring-1 ring-white/10">
              <div className="mb-3 text-2xl">{f.icon}</div>
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-white/55">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="relative border-t border-white/10 py-8 text-center text-xs text-white/40">
        © {new Date().getFullYear()} Moicut
      </footer>
    </div>
  );
}
