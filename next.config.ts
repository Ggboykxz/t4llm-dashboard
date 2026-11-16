import type { NextConfig } from "next";

// NEXT_PUBLIC_BASE_PATH is set to "/t4llm-dashboard" by the GitHub Pages
// workflow so assets resolve under https://ggboykxz.github.io/t4llm-dashboard/.
// Local `npm run dev` / `npm run build` keep the root path.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
};

export default nextConfig;
