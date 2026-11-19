import type { Metadata, Viewport } from "next";
import { Anton, Inter, Permanent_Marker, Playfair_Display } from "next/font/google";
import "./globals.css";

// Fonts used by the UI and by video text (see src/lib/fonts.ts).
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const anton = Anton({ variable: "--font-anton", weight: "400", subsets: ["latin"] });
const playfair = Playfair_Display({ variable: "--font-playfair", weight: ["700"], subsets: ["latin"] });
const marker = Permanent_Marker({ variable: "--font-marker", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Moicut · Your video. Your cut.",
  description: "The easiest way to edit videos in your browser. Trim, add text and music, and export for TikTok, Reels, Shorts and YouTube.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${anton.variable} ${playfair.variable} ${marker.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
