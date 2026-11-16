// Static checks on the exported site: exists, contains the brand, no tokens anywhere.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../out", import.meta.url).pathname;
const html = readFileSync(join(root, "index.html"), "utf8");
for (const needle of ["t4llm", "Qwen3-1.7B-Base", "Reading the public Hub"]) {
  if (!html.includes(needle)) {
    console.error(`missing marker in out/index.html: ${needle}`);
    process.exit(1);
  }
}

const bundleText = [];
function collect(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full);
      continue;
    }
    if (/\.(js|css|svg|json|html|txt)$/i.test(entry)) bundleText.push(readFileSync(full, "utf8"));
  }
}
collect(root);
const bundle = bundleText.join("\n");
for (const needle of ["ODC-BY-1.0", "Ggboykxz/t4llm-python-sft", "Qwen3-1.7B-Base", "not_measured", "Run health", "Gradient norm", "docs/EVAL.md", "Cumulative supervised tokens", "Runtime (from the Hub checkpoint)", "Build:", "copied", "next poll in", "epoch position"]) {
  if (!bundle.includes(needle)) {
    console.error(`missing content in exported bundle: ${needle}`);
    process.exit(1);
  }
}

const tokenPatterns = [
  /hf_[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
];
for (const pattern of tokenPatterns) {
  if (pattern.test(bundle)) {
    console.error(`token-like string found in the exported site: ${pattern}`);
    process.exit(1);
  }
}
console.log("smoke ok:", root);
