import type { Metadata } from "next";
import Link from "next/link";
import Logo from "@/components/Logo";
import TemplateGallery from "./TemplateGallery";

export const metadata: Metadata = {
  title: "Templates · Moicut",
  description: "Pick a style, drop in your clips, and Moicut builds the edit for you.",
};

export default function TemplatesPage() {
  return (
    <div className="min-h-dvh bg-neutral-950 text-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="Moicut home">
          <Logo />
        </Link>
        <Link href="/editor" className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/15">
          Blank project
        </Link>
      </header>
      <main className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Start from a template</h1>
        <p className="mt-2 max-w-xl text-white/60">
          Pick a style, drop in your clips, and Moicut builds the edit for you. Hover a template to preview it.
        </p>
        <TemplateGallery />
      </main>
    </div>
  );
}
