// Live data client for the t4llm Python SFT run.
//
// Everything read here is PUBLIC: the model repo, the data repo and the
// source-backup repo all mirror what a logged-out visitor sees. No tokens are
// used, stored or bundled. Browsers poll every few seconds, so the numbers you
// see can lag the training process by the push cadence (checkpoint uploads are
// intentionally not on the training critical path).

export const MODEL_REPO = "Ggboykxz/t4llm-python-sft";
export const DATA_REPO = "Ggboykxz/t4llm-python-data";
export const SOURCE_REPO = "Ggboykxz/t4llm-source";
export const GITHUB_REPO = "Ggboykxz/t4llm";

const HF_API = "https://huggingface.co";

export interface Heartbeat {
  run_id?: string;
  phase?: string;
  status?: string;
  step?: number;
  loss_ema?: number;
  tok_s?: number;
  vram_gib?: number;
  consumed_tokens?: number;
  session_age_s?: number;
  last_push_utc?: string | null;
  utc?: string;
  events?: Array<{ event?: string; utc?: string }>;
}

export interface MetricEvent {
  global_step?: number;
  step?: number;
  loss?: number | null;
  loss_ema?: number | null;
  grad_norm?: number | null;
  lr?: number | null;
  lr_scale?: number | null;
  consumed_tokens?: number | null;
  tokens?: number | null;
  tok_s?: number | null;
  vram_peak_gib?: number | null;
  elapsed?: number | null;
  rollbacks?: number | null;
  event?: string;
  tier?: string;
}

export interface HubTreeFile {
  type: "file" | "directory";
  path: string;
  size?: number;
  lfs?: { size?: number };
}

export interface Commit {
  id?: string;
  sha?: string;
  title?: string;
  message?: string;
  date?: string;
  authors?: Array<{ username?: string }>;
  author?: { date?: string; login?: string };
}

export interface CheckpointManifest {
  global_step?: number;
  config_hash?: string;
  consumed_tokens?: number;
  created_utc?: string;
  data_revision?: string;
  tier?: string;
  files?: Record<string, { bytes: number; sha256: string }>;
  cursor?: { data_revision?: string; sample_idx?: number; consumed_tokens?: number };
}

export interface TrainerState {
  global_step?: number;
  total_steps?: number;
  rollbacks?: number;
  oom_stage?: number;
  optimizer_reset?: boolean;
  skipped_steps?: number;
  tier?: string;
  run_id?: string;
  updated_utc?: string;
  runtime_notes?: string[];
}

export interface DataManifest {
  dataset?: string;
  revision?: string;
  split_seed?: number;
  n_train?: number;
  n_heldout?: number;
  train_sha256?: string;
  heldout_sha256?: string;
  built_utc?: string;
}

export interface BackupLatest {
  commit?: string;
  short?: string;
  created_utc?: string;
  archive?: { name: string; bytes: number; sha256: string };
  bundle?: { name: string; bytes: number; sha256: string };
  note?: string;
}

export interface RepoInfo {
  id?: string;
  lastModified?: string;
  sha?: string;
  siblings?: Array<{ rfilename?: string }>;
  usedStorage?: number;
  downloads?: number;
  likes?: number;
  private?: boolean;
}

export interface RuntimeEnv {
  gpu_name?: string;
  torch_version?: string;
  cuda_version?: string;
  compute_capability?: string;
  sdpa?: boolean;
  bf16_reported?: boolean;
  vram_gib?: number;
  python?: string;
  platform?: string;
  training_capable?: boolean;
  git_sha?: string;
}

export interface CheckpointSummary {
  dir: string;
  step: number;
  files: number;
  bytes: number;
  tier?: string;
  created_utc?: string;
  consumed_tokens?: number;
  manifest?: CheckpointManifest;
}

export interface FeedItem {
  sha: string;
  title: string;
  date?: string;
  url: string;
  source: "github" | "hf-model" | "hf-source" | "hf-data";
}

export interface SectionError {
  section: string;
  message: string;
}

export interface DashboardData {
  heartbeat?: Heartbeat;
  metrics: MetricEvent[];
  latest?: string;
  checkpoints: CheckpointSummary[];
  trainerState?: TrainerState;
  modelRepo?: RepoInfo;
  dataRepoFiles: HubTreeFile[];
  dataManifest?: DataManifest;
  backup?: BackupLatest;
  githubRepo?: Record<string, unknown>;
  evalText?: string;
  env?: RuntimeEnv;
  feed: FeedItem[];
  errors: SectionError[];
  fetchedAt: number;
}

function bust(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}t4llm=${Date.now()}`;
}

async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(bust(url), {
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(bust(url), { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function normalizeDate(d?: string): string | undefined {
  return d ? new Date(d).toISOString() : undefined;
}

function feedFromGithub(commits: unknown): FeedItem[] {
  if (!Array.isArray(commits)) return [];
  return commits.slice(0, 8).map((c) => {
    const item = c as {
      sha: string;
      commit: { message: string; author?: { date?: string } };
      html_url?: string;
    };
    return {
      sha: item.sha,
      title: item.commit.message.split("\n")[0].slice(0, 140),
      date: normalizeDate(item.commit.author?.date),
      url: item.html_url ?? `https://github.com/${GITHUB_REPO}/commit/${item.sha}`,
      source: "github",
    };
  });
}

function feedFromHf(
  commits: unknown,
  repo: string,
  source: FeedItem["source"]
): FeedItem[] {
  if (!Array.isArray(commits)) return [];
  const prefix = source === "hf-data" ? "datasets/" : "";
  return commits.slice(0, 8).map((c) => {
    const item = c as Commit;
    const sha = item.id ?? item.sha ?? "unknown";
    const title = (item.title ?? item.message ?? "").split("\n")[0].slice(0, 140);
    return {
      sha,
      title,
      date: normalizeDate(item.date ?? item.author?.date),
      url: `https://huggingface.co/${prefix}${repo}/commit/${sha}`,
      source,
    };
  });
}

function readCache<T>(key: string): { t: number; v: T } | undefined {
  try {
    if (typeof sessionStorage === "undefined") return undefined;
    const raw = sessionStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { t: number; v: T };
    if (typeof parsed !== "object" || parsed === null || typeof parsed.t !== "number") return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCache(key: string, value: { t: number; v: unknown }): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage full or unavailable; the dashboard still works, just uncached.
  }
}

async function settle<T>(
  label: string,
  task: () => Promise<T>,
  errors: SectionError[],
  ttlMs = 0
): Promise<T | undefined> {
  const key = `t4llm-dash:${label}`;
  const cached = readCache<T>(key);
  if (cached && ttlMs > 0 && Date.now() - cached.t < ttlMs) {
    return cached.v;
  }
  try {
    const value = await task();
    writeCache(key, { t: Date.now(), v: value });
    return value;
  } catch (err) {
    if (cached) {
      // stale-while-error: keep the last good value instead of blanking the card
      return cached.v;
    }
    errors.push({ section: label, message: err instanceof Error ? err.message : String(err) });
    return undefined;
  }
}

export async function loadDashboard(): Promise<DashboardData> {
  const errors: SectionError[] = [];
  const modelApi = `${HF_API}/api/models/${MODEL_REPO}`;
  const dataApi = `${HF_API}/api/datasets/${DATA_REPO}`;
  const sourceApi = `${HF_API}/api/models/${SOURCE_REPO}`;
  const raw = (repo: string, path: string) => `${HF_API}/${repo}/raw/main/${path}`;

  const [heartbeat, metricsText, latestRaw, tree, trainerLatest, modelInfo, dataTree, dataManifest, backup, githubRepo, ghCommits, hfModelCommits, hfSourceCommits, hfDataCommits, evalText, runtimeEnv] =
    await Promise.all([
      settle("heartbeat", () => fetchJson<Heartbeat>(raw(MODEL_REPO, "heartbeat.json")), errors, 0),
      settle("metrics", () => fetchText(raw(MODEL_REPO, "metrics.jsonl")), errors, 0),
      settle("LATEST", () => fetchText(raw(MODEL_REPO, "LATEST")), errors, 0),
      settle("checkpoint tree", () =>
        fetchJson<HubTreeFile[]>(`${modelApi}/tree/main?recursive=true`),
        errors,
        30_000
      ),
      settle("trainer state", async () => {
        const latest = (await fetchText(raw(MODEL_REPO, "LATEST"))).trim();
        if (!latest) return undefined;
        return fetchJson<TrainerState>(raw(MODEL_REPO, `${latest}/trainer_state.json`));
      }, errors, 30_000),
      settle("model repo info", () => fetchJson<RepoInfo>(modelApi), errors, 60_000),
      settle("data repo tree", () => fetchJson<HubTreeFile[]>(`${dataApi}/tree/main?recursive=true`), errors, 60_000),
      settle("data manifest", () => fetchJson<DataManifest>(raw(DATA_REPO, "MANIFEST.json")), errors, 300_000),
      settle("source backup", () => fetchJson<BackupLatest>(raw(SOURCE_REPO, "backup/LATEST.json")), errors, 300_000),
      settle("github repo", () => fetchJson<Record<string, unknown>>(`https://api.github.com/repos/${GITHUB_REPO}`), errors, 240_000),
      settle("github commits", () => fetchJson<unknown[]>(`https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=8`), errors, 240_000),
      settle("hf commits", () => fetchJson<unknown[]>(`${modelApi}/commits/main?limit=8`), errors, 60_000),
      settle("hf source commits", () => fetchJson<unknown[]>(`${sourceApi}/commits/main?limit=8`), errors, 300_000),
      settle("hf data commits", () => fetchJson<unknown[]>(`${dataApi}/commits/main?limit=8`), errors, 300_000),
      settle("eval report", () => fetchText(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/docs/EVAL.md`), errors, 300_000),
      settle("runtime env", async () => {
        const latest = (await fetchText(raw(MODEL_REPO, "LATEST"))).trim();
        if (!latest) return undefined;
        return fetchJson<RuntimeEnv>(raw(MODEL_REPO, `${latest}/env.json`));
      }, errors, 300_000),
    ]);

  const metrics: MetricEvent[] = [];
  if (metricsText) {
    for (const line of metricsText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        metrics.push(JSON.parse(trimmed) as MetricEvent);
      } catch {
        errors.push({ section: "metrics", message: `invalid JSON line: ${trimmed.slice(0, 80)}` });
      }
    }
  }

  const latest = latestRaw?.trim() || undefined;

  // Group files by checkpoint directory; keep only checkpoints that carry a manifest.
  const files = tree ?? [];
  const byDir = new Map<string, HubTreeFile[]>();
  for (const file of files) {
    if (file.type !== "file") continue;
    const match = /^(ckpt-\d+)\//.exec(file.path);
    if (!match) continue;
    const list = byDir.get(match[1]) ?? [];
    list.push(file);
    byDir.set(match[1], list);
  }

  const checkpoints: CheckpointSummary[] = [];
  const dirs = [...byDir.keys()].sort().reverse().slice(0, 6);
  for (const dir of dirs) {
    const list = byDir.get(dir)!;
    const bytes = list.reduce((acc, f) => acc + (f.lfs?.size ?? f.size ?? 0), 0);
    const step = Number(dir.replace("ckpt-", "")) || 0;
    const summary: CheckpointSummary = { dir, step, files: list.length, bytes };
    if (list.some((f) => f.path.endsWith("manifest.json"))) {
      try {
        const manifest = await fetchJson<CheckpointManifest>(
          raw(MODEL_REPO, `${dir}/manifest.json`)
        );
        summary.tier = manifest.tier;
        summary.created_utc = manifest.created_utc;
        summary.consumed_tokens = manifest.consumed_tokens ?? manifest.cursor?.consumed_tokens;
        summary.manifest = manifest;
      } catch (err) {
        errors.push({
          section: `checkpoint ${dir}`,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    checkpoints.push(summary);
  }
  checkpoints.sort((a, b) => b.step - a.step);

  const feed = [
    ...feedFromGithub(ghCommits),
    ...feedFromHf(hfModelCommits, MODEL_REPO, "hf-model"),
    ...feedFromHf(hfSourceCommits, SOURCE_REPO, "hf-source"),
    ...feedFromHf(hfDataCommits, DATA_REPO, "hf-data"),
  ]
    .filter((item) => item.title || item.sha)
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
    .slice(0, 14);

  return {
    heartbeat,
    metrics,
    latest,
    checkpoints,
    trainerState: trainerLatest,
    modelRepo: modelInfo,
    dataRepoFiles: dataTree ?? [],
    dataManifest,
    backup,
    githubRepo,
    evalText,
    env: runtimeEnv,
    feed,
    errors,
    fetchedAt: Date.now(),
  };
}

export function stepEtaSeconds(metrics: MetricEvent[], totalSteps?: number): number | undefined {
  const rows = metrics.filter((m) => typeof m.elapsed === "number" && typeof m.global_step === "number");
  if (rows.length < 2 || !totalSteps) return undefined;
  const last = rows[rows.length - 1];
  if (typeof last.global_step !== "number") return undefined;
  const remaining = Math.max(0, totalSteps - last.global_step);
  const deltas: number[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const dt = (rows[i].elapsed ?? 0) - (rows[i - 1].elapsed ?? 0);
    if (Number.isFinite(dt) && dt > 0) deltas.push(dt);
  }
  if (deltas.length === 0) return undefined;
  deltas.sort((a, b) => a - b);
  const median = deltas[Math.floor(deltas.length / 2)];
  return remaining * median;
}

export function avgTokPerSec(metrics: MetricEvent[], windowSize = 20): number | undefined {
  const rows = metrics.filter((m) => typeof m.tok_s === "number" && m.tok_s! > 0);
  if (rows.length === 0) return undefined;
  const slice = rows.slice(-windowSize);
  return slice.reduce((acc, m) => acc + (m.tok_s ?? 0), 0) / slice.length;
}

export function formatDuration(seconds: number | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  const hours = seconds / 3600;
  return `${hours.toFixed(1)} h`;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return "—";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatInt(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  const seconds = Math.max(0, (Date.now() - ts) / 1000);
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
