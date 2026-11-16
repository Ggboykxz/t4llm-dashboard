import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "t4llm — Live training dashboard",
  description:
    "Live view of the crash-only Python SFT run of Qwen3-1.7B-Base on one T4: heartbeat, checkpoints, metrics, source backup and data manifests.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
