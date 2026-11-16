import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#070b16",
  colorScheme: "dark",
};

const OG_IMAGE =
  "https://ggboykxz.github.io/t4llm-dashboard/opengraph-image.png";

export const metadata: Metadata = {
  metadataBase: new URL("https://ggboykxz.github.io/t4llm-dashboard/"),
  title: "t4llm — Live training dashboard",
  description:
    "Live view of the crash-only Python SFT run of Qwen3-1.7B-Base on one T4: heartbeat, checkpoints, metrics, source backup and data manifests.",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "t4llm — Live training dashboard",
    description:
      "Crash-only, resumable SFT of Qwen3-1.7B-Base on one T4. Checkpoints, metrics, data digests and eval status — read live from the public Hub.",
    url: "https://ggboykxz.github.io/t4llm-dashboard/",
    siteName: "t4llm-dashboard",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "t4llm live training dashboard" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "t4llm — Live training dashboard",
    description:
      "Crash-only, resumable SFT of Qwen3-1.7B-Base on one T4, live from the public Hub.",
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
