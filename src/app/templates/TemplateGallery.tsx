"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import TemplateCard from "@/components/TemplateCard";
import { TEMPLATES, type TemplateCategory } from "@/lib/templates";

const CATEGORIES: ("All" | TemplateCategory)[] = ["All", "Trending", "Story", "Fun", "Business"];

export default function TemplateGallery() {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const shown = TEMPLATES.filter((t) => category === "All" || t.category === category);

  return (
    <>
      <div className="mt-6 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 transition ${
              category === c ? "bg-white text-black ring-white" : "bg-white/5 text-white/70 ring-white/10 hover:bg-white/10"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {shown.map((def) => (
          <TemplateCard key={def.id} def={def} onUse={(d) => router.push(`/editor?template=${d.id}`)} />
        ))}
      </div>
    </>
  );
}
