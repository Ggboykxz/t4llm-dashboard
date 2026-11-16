"use client";

import { Card, Kpi, Pill, Sparkline } from "../components/cards";
import {
  avgTokPerSec,
  formatBytes,
  formatDuration,
  formatInt,
  loadDashboard,
  stepEtaSeconds,
  DATA_REPO,
  GITHUB_REPO,
  MODEL_REPO,
  SOURCE_REPO,
  type DashboardData,
} from "../lib/hub";
import { usePolling } from "../lib/usePolling";

const POLL_MS = 15_000;

function ghNumber(repo: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = repo?.[key];
  return typeof value === "number" ? value : undefined;
}

function ghString(repo: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = repo?.[key];
  return typeof value === "string" ? value : undefined;
}

function heartbeatAgeSeconds(heartbeat?: { utc?: string }): number | undefined {
  if (!heartbeat?.utc) return undefined;
  const ts = Date.parse(heartbeat.utc);
  if (Number.isNaN(ts)) return undefined;
  return Math.max(0, (Date.now() - ts) / 1000);
}

export default function DashboardPage() {
  const { data, refreshing, refresh } = usePolling<DashboardData>(loadDashboard, POLL_MS);

  if (!data) {
    return (
      <main className="page">
        <div className="hero">
          <h1>t4llm — Live training dashboard</h1>
          <p>Loading live telemetry from the public Hub…</p>
        </div>
      </main>
    );
  }

  const hb = data.heartbeat;
  const latest = hb?.step ?? data.checkpoints[0]?.step ?? 0;
  const totalSteps = data.trainerState?.total_steps;
  const currentStep = Math.max(latest, data.trainerState?.global_step ?? 0);
  const progress = totalSteps ? Math.min(100, (100 * currentStep) / totalSteps) : undefined;
  const eta = stepEtaSeconds(data.metrics, totalSteps);
  const lastStep = data.metrics.filter((m) => typeof m.global_step === "number").at(-1);
  const avgTok = avgTokPerSec(data.metrics);
  const lossValues = data.metrics
    .filter((m) => typeof m.loss === "number")
    .map((m) => m.loss as number);
  const emaValues = data.metrics
    .filter((m) => typeof m.loss_ema === "number")
    .map((m) => m.loss_ema as number);
  const tokValues = data.metrics
    .filter((m) => typeof m.tok_s === "number")
    .map((m) => m.tok_s as number);
  const age = heartbeatAgeSeconds(hb);

  const freshness =
    age === undefined ? "neutral" : age < 300 ? "fresh" : age < 900 ? "stale" : "dead";
  const freshnessLabel =
    freshness === "neutral"
      ? "no heartbeat yet"
      : freshness === "fresh"
        ? `live (heartbeat ${Math.round(age!)}s ago)`
        : freshness === "stale"
          ? `stale heartbeat (${Math.round(age!)}s ago — run preempted or idle)`
          : `stale heartbeat (${Math.round(age! / 60)} min ago — no live process)`;

  const commits = data.feed.length;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">t4llm <small>live</small></span>
          <span className={`live-dot ${freshness}`}>
            <span className="dot" />
            {freshnessLabel}
          </span>
          <span className="spacer" />
          <span className="muted mono">polled {new Date(data.fetchedAt).toLocaleTimeString()}</span>
          <button className="refresh" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <h1>Python SFT — Qwen3-1.7B-Base on one T4</h1>
          <p>
            Crash-only, resumable fine-tune. Checkpoints land in the public Hub repo{" "}
            <a href={`https://huggingface.co/${MODEL_REPO}`}>{MODEL_REPO}</a> before they are
            considered durable; a <code>kill -9</code> can lose at most one push cadence. Data:{" "}
            <a href={`https://huggingface.co/datasets/${DATA_REPO}`}>{DATA_REPO}</a> (ODC-BY-1.0).
            Source: <a href={`https://github.com/${GITHUB_REPO}`}>{GITHUB_REPO}</a>.
          </p>
        </section>

        <section className="grid kpis">
          <Kpi
            label="Step"
            value={`${currentStep}${totalSteps ? ` / ${totalSteps}` : ""}`}
            sub={totalSteps ? `${progress?.toFixed(1)}% of one epoch` : "max_steps not read from Hub yet"}
          />
          <Kpi
            label="Loss EMA"
            value={hb?.loss_ema?.toFixed(4) ?? "—"}
            sub={lastStep?.loss != null ? `last loss ${Number(lastStep.loss).toFixed(4)}` : undefined}
          />
          <Kpi
            label="Throughput"
            value={avgTok ? `${avgTok.toFixed(0)} tok/s` : "—"}
            sub="mean of last 20 logged steps"
          />
          <Kpi
            label="VRAM peak"
            value={hb?.vram_gib ? `${hb.vram_gib.toFixed(2)} GiB` : "—"}
            sub="T4: 14.56 GiB"
          />
          <Kpi
            label="Tokens consumed"
            value={formatInt(hb?.consumed_tokens)}
            sub={`across ${formatInt(currentStep)} optimizer steps`}
          />
          <Kpi
            label="ETA"
            value={formatDuration(eta)}
            sub="remaining optimizer steps × median step time"
          />
        </section>

        <section className="card">
          <div className="chart-title">
            <h2>Training progress</h2>
            <Pill tone={currentStep > 0 ? "good" : "warn"}>
              {currentStep > 0 ? "checkpoints durable on the Hub" : "no checkpoint yet"}
            </Pill>
          </div>
          <div className="progress" aria-label="training progress">
            <div style={{ width: `${progress ?? 0}%` }} />
          </div>
          <div className="muted mono" style={{ marginTop: 8 }}>
            LATEST → {data.latest ?? "—"} · phase {hb?.phase ?? "sft"} · status {hb?.status ?? "unknown"} · run{" "}
            {hb?.run_id ?? "—"} · loss is completion-masked SFT loss
          </div>
        </section>

        <div style={{ height: 14 }} />
        <section className="grid two">
          <Card title="Loss" right={<span className="muted mono">{lossValues.length} steps logged</span>}>
            <Sparkline values={lossValues} color="#fb7185" label="loss per step" />
            <div style={{ height: 8 }} />
            <Sparkline values={emaValues} color="#22d3ee" label="loss EMA" />
            <div className="muted mono" style={{ marginTop: 6 }}>pink: per-step loss · cyan: exponential moving average</div>
          </Card>
          <Card title="Throughput (tok/s)" right={<span className="muted mono">wall clock of the child process</span>}>
            <Sparkline values={tokValues} color="#34d399" label="tokens per second" height={180} />
            <div className="muted" style={{ marginTop: 8 }}>
              Throughput is measured by the trainer on supervised tokens; it is not a benchmark.
              Eval numbers appear only after a held-out run against the frozen base.
            </div>
          </Card>
        </section>

        <div style={{ height: 14 }} />
        <section className="grid two">
          <Card
            title="Checkpoints on the Hub"
            right={<span className="muted mono">{data.checkpoints.length} newest shown</span>}
          >
            <div className="scroll-x">
              <table>
                <thead>
                  <tr><th>step</th><th>tier</th><th>files</th><th>size</th><th>created</th><th>sha256 (adapter)</th></tr>
                </thead>
                <tbody>
                  {data.checkpoints.map((ckpt) => {
                    const adapter = ckpt.manifest?.files?.["adapter_model.safetensors"];
                    return (
                      <tr key={ckpt.dir}>
                        <td className="mono">{ckpt.step}</td>
                        <td>{ckpt.tier ?? "—"}</td>
                        <td>{ckpt.files}</td>
                        <td>{formatBytes(ckpt.bytes)}</td>
                        <td className="mono">{ckpt.created_utc ? new Date(ckpt.created_utc).toLocaleString() : "—"}</td>
                        <td className="mono">{adapter ? adapter.sha256.slice(0, 12) + "…" : "—"}</td>
                      </tr>
                    );
                  })}
                  {data.checkpoints.length === 0 && (
                    <tr><td colSpan={6} className="muted">No checkpoint folder listed yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Commit feed" right={<span className="muted mono">{commits} commits</span>}>
            <table>
              <thead><tr><th>source</th><th>commit</th><th>when</th></tr></thead>
              <tbody>
                {data.feed.map((item) => (
                  <tr key={`${item.source}-${item.sha}`}>
                    <td><Pill tone="neutral">{item.source}</Pill></td>
                    <td><a href={item.url} rel="noreferrer" target="_blank">{item.title || item.sha.slice(0, 10)}</a></td>
                    <td className="mono">{item.date ? new Date(item.date).toLocaleString() : "—"}</td>
                  </tr>
                ))}
                {data.feed.length === 0 && <tr><td colSpan={3} className="muted">No commits fetched.</td></tr>}
              </tbody>
            </table>
          </Card>
        </section>

        <div style={{ height: 14 }} />
        <section className="grid three">
          <Card title="Training data" right={<Pill tone="good">ODC-BY-1.0 · attribution</Pill>}>
            <dl className="mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0 }}>
              <dt className="muted">dataset</dt><dd style={{ margin: 0 }}>{data.dataManifest?.dataset ?? DATA_REPO}</dd>
              <dt className="muted">revision</dt><dd style={{ margin: 0 }}>{data.dataManifest?.revision?.slice(0, 12) ?? "—"}</dd>
              <dt className="muted">train / held-out</dt><dd style={{ margin: 0 }}>{data.dataManifest?.n_train ?? "—"} / {data.dataManifest?.n_heldout ?? "—"}</dd>
              <dt className="muted">split seed</dt><dd style={{ margin: 0 }}>{data.dataManifest?.split_seed ?? "—"}</dd>
              <dt className="muted">train sha256</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{data.dataManifest?.train_sha256 ?? "—"}</dd>
              <dt className="muted">held-out sha256</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{data.dataManifest?.heldout_sha256 ?? "—"}</dd>
            </dl>
            <p className="muted" style={{ marginTop: 8 }}>
              See <a href={`https://huggingface.co/datasets/${DATA_REPO}/blob/main/NOTICE`}>NOTICE</a> for attribution.
              The held-out set is never used for training.
            </p>
          </Card>

          <Card title="Source backup" right={<Pill tone="good">public</Pill>}>
            {data.backup ? (
              <>
                <dl className="mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0 }}>
                  <dt className="muted">commit</dt><dd style={{ margin: 0 }}>{data.backup.short ?? data.backup.commit?.slice(0, 12)}</dd>
                  <dt className="muted">created</dt><dd style={{ margin: 0 }}>{data.backup.created_utc ? new Date(data.backup.created_utc).toLocaleString() : "—"}</dd>
                  <dt className="muted">archive</dt><dd style={{ margin: 0 }}>{data.backup.archive?.name}<br />{formatBytes(data.backup.archive?.bytes)}</dd>
                  <dt className="muted">bundle</dt><dd style={{ margin: 0 }}>{data.backup.bundle?.name}<br />{formatBytes(data.backup.bundle?.bytes)}</dd>
                </dl>
                <p className="muted" style={{ marginTop: 8 }}>
                  <a href={`https://huggingface.co/${SOURCE_REPO}`}>Source + full git history</a>, restored with{" "}
                  <code>git clone {data.backup.archive?.name.replace("tar.gz", "bundle")}</code>.
                </p>
              </>
            ) : (
              <p className="error">Source backup unavailable.</p>
            )}
          </Card>

          <Card title="Repository health">
            <dl className="mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0 }}>
              <dt className="muted">GitHub stars</dt><dd style={{ margin: 0 }}>{ghNumber(data.githubRepo, "stargazers_count") ?? "—"}</dd>
              <dt className="muted">default branch</dt><dd style={{ margin: 0 }}>{ghString(data.githubRepo, "default_branch") ?? "—"}</dd>
              <dt className="muted">open issues</dt><dd style={{ margin: 0 }}>{ghNumber(data.githubRepo, "open_issues_count") ?? "—"}</dd>
              <dt className="muted">license</dt><dd style={{ margin: 0 }}>Apache-2.0</dd>
              <dt className="muted">model repo storage</dt><dd style={{ margin: 0 }}>{formatBytes(data.modelRepo?.usedStorage)}</dd>
              <dt className="muted">model downloads (30d)</dt><dd style={{ margin: 0 }}>{formatInt(data.modelRepo?.downloads)}</dd>
            </dl>
            <p className="muted" style={{ marginTop: 8 }}>
              Code and merged model: Apache-2.0. Base model: Qwen3-1.7B-Base (Apache-2.0).
              Training data: ODC-BY-1.0 — attribution required; see the dataset NOTICE.
            </p>
          </Card>
        </section>

        <div style={{ height: 14 }} />
        <Card title="Evaluation — not_measured" right={<Pill tone="warn">no benchmark yet</Pill>}>
          <p style={{ margin: 0 }}>
            No held-out perplexity, pass@1 or execution accuracy has been measured for this run yet.
            When the SFT run completes, <code>t4llm eval</code> scores the adapter against the frozen
            base on the 500-example held-out set. Until that number exists, nothing here is a
            claim of quality — and nothing is “obviously” better than the base model.
          </p>
        </Card>

        {data.errors.length > 0 && (
          <>
            <div style={{ height: 14 }} />
            <Card title="Fetch errors (data may be stale)">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {data.errors.map((err, i) => (
                  <li key={i} className="error mono">{err.section}: {err.message}</li>
                ))}
              </ul>
            </Card>
          </>
        )}

        <footer className="footer">
          <p style={{ marginTop: 0 }}>
            t4llm-dashboard — public, read-only, no tokens, no private data. It reads the public HF
            model/dataset repos and the public GitHub repo every 15 s. “Live” means “as durable as
            the last verified Hub push”: a crashed Colab cell can be up to one push cadence stale.
          </p>
          <p style={{ marginBottom: 0 }}>
            Links: <a href={`https://github.com/${GITHUB_REPO}`}>source</a> ·{" "}
            <a href={`https://huggingface.co/${MODEL_REPO}`}>model checkpoints</a> ·{" "}
            <a href={`https://huggingface.co/datasets/${DATA_REPO}`}>dataset</a> ·{" "}
            <a href={`https://huggingface.co/${SOURCE_REPO}`}>source backup</a> ·{" "}
            <a href="https://huggingface.co/Qwen/Qwen3-1.7B-Base">base model (Apache-2.0)</a> ·{" "}
            <a href="https://opendatacommons.org/licenses/by/1-0/">ODC-BY-1.0</a>
          </p>
        </footer>
      </main>
    </>
  );
}
