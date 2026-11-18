"use client";

import { AreaChart } from "../components/charts";
import { CommandPalette } from "../components/command-palette";
import { Stepper } from "../components/stepper";
import { Card, CopyDigest, Kpi, Pill, Skeleton, Sparkline } from "../components/cards";
import {
  avgTokPerSec,
  formatBytes,
  formatDuration,
  formatInt,
  loadDashboard,
  stepEtaSeconds,
  timeAgo,
  DATA_REPO,
  GITHUB_REPO,
  MODEL_REPO,
  SOURCE_REPO,
  type DashboardData,
} from "../lib/hub";
import { useEffect, useState } from "react";
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


  // Countdown to the next poll tick; reset whenever a refresh lands.
  const [countdown, setCountdown] = useState(POLL_MS / 1000);
  const [lossTab, setLossTab] = useState<"loss" | "ema" | "grad">("loss");
  const fetchedAt = data?.fetchedAt;
  useEffect(() => {
    setCountdown(POLL_MS / 1000);
  }, [fetchedAt]);
  useEffect(() => {
    const id = window.setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Peak loss and its step (for the annotation under the loss chart).
  let peakLoss: number | undefined;
  let peakStep: number | undefined;
  for (const m of data?.metrics ?? []) {
    if (typeof m.loss === "number" && (peakLoss === undefined || m.loss > peakLoss)) {
      peakLoss = m.loss;
      peakStep = m.global_step ?? m.step;
    }
  }

  if (!data) {
    return (
      <main className="page">
        <div className="hero">
          <h1>t4llm — live</h1>
          <p>Reading the public Hub…</p>
        </div>
        <div className="grid kpis" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card"><Skeleton height={14} width="45%" /><div style={{ height: 10 }} /><Skeleton height={26} /><div style={{ height: 8 }} /><Skeleton height={10} width="60%" /></div>
          ))}
        </div>
        <div className="card"><div style={{ height: 180 }}><Skeleton height={180} /></div></div>
      </main>
    );
  }

  const hb = data.heartbeat;
  const latest = hb?.step ?? data.checkpoints[0]?.step ?? 0;
  // trainerState.total_steps counts attempted optimizer steps, not the planned
  // max (rollback/replay makes it drift). Prefer the configured max published
  // in the heartbeat, then the checkpoint's own max, then this run's 625.
  const totalSteps = hb?.max_steps ?? data.trainerState?.max_steps ?? 625;
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
  const gradValues = data.metrics
    .filter((m) => typeof m.grad_norm === "number")
    .map((m) => m.grad_norm as number);

  // Deltas over the last 10 logged steps vs the previous 10.
  const meanOf = (xs: number[]) => xs.reduce((acc, x) => acc + x, 0) / Math.max(1, xs.length);
  const lossTail = lossValues.slice(-10);
  const lossPrev = lossValues.slice(-20, -10);
  const lossDelta =
    lossTail.length > 0 && lossPrev.length > 0 ? meanOf(lossTail) - meanOf(lossPrev) : undefined;
  const tokTail = tokValues.slice(-10);
  const tokPrev = tokValues.slice(-20, -10);
  const tokDeltaPct =
    tokTail.length > 0 && tokPrev.length > 0 && meanOf(tokPrev) > 0
      ? ((meanOf(tokTail) - meanOf(tokPrev)) / meanOf(tokPrev)) * 100
      : undefined;

  const eventRows = data.metrics
    .filter((m) => typeof m.event === "string")
    .map((m) => ({
      event: m.event as string,
      step: m.step ?? m.global_step,
      tier: m.tier,
    }))
    .slice(-12)
    .reverse();
  const latestCheckpoint = data.checkpoints.find((c) => c.dir === data.latest) ?? data.checkpoints[0];
  const sampleIdx = latestCheckpoint?.manifest?.cursor?.sample_idx;
  const epochIdx = latestCheckpoint?.manifest?.cursor?.shard_idx;
  const totalSamples = data.dataManifest?.n_train ?? 10_000;
  const epochPct = sampleIdx !== undefined ? Math.min(100, (sampleIdx / totalSamples) * 100) : undefined;
  const cumulativeTokens = data.metrics
    .filter((m) => typeof m.consumed_tokens === "number")
    .map((m) => m.consumed_tokens as number);
  const hbStatus = hb?.status ?? "unknown";
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA?.slice(0, 7) ?? "dev";

  // Parse the markdown table in docs/EVAL.md from the source repo (public raw file).
  // Lines like "| 2026-11-16T14:00:00+00:00 | run | 8 | 3.21 | 4.10 | 2.50 | 2.60 | false | 0.05 |"
  const evalRows = (data.evalText ?? "")
    .split("\n")
    .filter((line) => /^\|\s*\d{4}-\d{2}-\d{2}T/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .map((cells) => ({
      utc: cells[0],
      run: cells[1],
      step: cells[2],
      domainPpl: cells[3],
      baseDomainPpl: cells[4],
      generalPpl: cells[5],
      baseGeneralPpl: cells[6],
      regression: cells[7],
    }));

  const ts = data.trainerState;
  const evalDone = evalRows.length > 0;
  const exportDone = Boolean(data.exportMarker?.trim());
  const publishDone = data.modelCardText ? !/work in progress|do not use until/i.test(data.modelCardText) : false;
  const copy = (text: string) => () => {
    try {
      void navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  };
  const paletteItems = [
    { label: "Open model repo", hint: MODEL_REPO, keywords: ["model", "hf", "checkpoints"], run: () => window.open(`https://huggingface.co/${MODEL_REPO}`, "_blank", "noopener") },
    { label: "Open data repo", hint: DATA_REPO, keywords: ["data", "dataset", "odc-by"], run: () => window.open(`https://huggingface.co/datasets/${DATA_REPO}`, "_blank", "noopener") },
    { label: "Open source (GitHub)", hint: GITHUB_REPO, keywords: ["github", "source", "code"], run: () => window.open(`https://github.com/${GITHUB_REPO}`, "_blank", "noopener") },
    { label: "Open source backup", hint: SOURCE_REPO, keywords: ["backup", "archive", "bundle"], run: () => window.open(`https://huggingface.co/${SOURCE_REPO}`, "_blank", "noopener") },
    { label: "View metrics.jsonl", hint: "raw, every step", keywords: ["metrics", "logs", "jsonl"], run: () => window.open(`https://huggingface.co/${MODEL_REPO}/raw/main/metrics.jsonl`, "_blank", "noopener") },
    { label: "View EVAL.md", hint: "held-out results", keywords: ["eval", "benchmark", "perplexity"], run: () => window.open(`https://github.com/${GITHUB_REPO}/blob/main/docs/EVAL.md`, "_blank", "noopener") },
    { label: "Copy resume command", hint: "kill -9-safe", keywords: ["resume", "supervise", "cell"], run: copy("python -m t4llm supervise --config configs/python-sft.yaml --time-budget 20m") },
    { label: "Copy eval command", hint: "held-out", keywords: ["eval", "held-out"], run: copy("python -m t4llm eval --config configs/python-sft.yaml --domain-set data/python-sft/heldout.jsonl") },
    { label: "Copy export command", hint: "merged fp16 + GGUF", keywords: ["export", "gguf", "merge"], run: copy("python -m t4llm export --config configs/python-sft.yaml --train-file data/python-sft/train.jsonl") },
    { label: "Open base model card", hint: "Qwen3-1.7B-Base · Apache-2.0", keywords: ["base", "qwen", "apache"], run: () => window.open("https://huggingface.co/Qwen/Qwen3-1.7B-Base", "_blank", "noopener") },
  ];
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

  // "training" only means the last process said so.  A dead heartbeat means the
  // session ended without pushing a terminal status (hard Colab termination);
  // never show a live ETA or a pulsing pipeline step in that state.
  const runLive = hbStatus === "training" && freshness === "fresh";
  const runPaused = hbStatus === "training" && freshness === "dead";
  const runTerminal =
    hbStatus === "stopped" ||
    hbStatus === "interrupted" ||
    hbStatus === "fatal" ||
    hbStatus === "push_failed" ||
    hbStatus === "data_exhausted";
  const displayStatus =
    hbStatus === "training" && !runLive ? `${hbStatus} (no live heartbeat)` : hbStatus;

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
          <span className="muted mono" title="Time since last poll">next poll in {countdown}s</span>
          <button className="refresh" onClick={refresh} disabled={refreshing}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <CommandPalette items={paletteItems} />
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
            sub={
              <>
                {lastStep?.loss != null ? `last loss ${Number(lastStep.loss).toFixed(4)}` : "no steps yet"}
                {lossDelta !== undefined && (
                  <> {"  ·  "}{lossDelta <= 0
                    ? <span className="delta-good">▼ {Math.abs(lossDelta).toFixed(3)}</span>
                    : <span className="delta-bad">▲ {lossDelta.toFixed(3)}</span>} vs 10 early steps</>
                )}
              </>
            }
          />
          <Kpi
            label="Throughput"
            value={avgTok ? `${avgTok.toFixed(0)} tok/s` : "—"}
            sub={
              <>
                mean of last 20 steps
                {tokDeltaPct !== undefined && (
                  <> {"  ·  "}{tokDeltaPct >= 0
                    ? <span className="delta-good">▲ +{tokDeltaPct.toFixed(0)}%</span>
                    : <span className="delta-bad">▼ {tokDeltaPct.toFixed(0)}%</span>} vs 10 earlier</>
                )}
              </>
            }
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
            value={runLive ? formatDuration(eta) : "—"}
            sub={runLive ? "remaining optimizer steps × median step time" : "run is not live"}
          />
        </section>

        {hbStatus === "done" && (
          <div className="banner good">
            <strong>Run complete.</strong> All {totalSteps ?? 625} steps done. Next:{" "}
            <code>t4llm eval --domain-set data/python-sft/heldout.jsonl</code>, then export.
            The Evaluation card below fills itself from <code>docs/EVAL.md</code>.
          </div>
        )}

        {runPaused && (
          <div className="banner idle">
            <strong>Training is not running.</strong> Last heartbeat {timeAgo(hb?.utc)} at step{" "}
            {formatInt(currentStep)}
            {totalSteps ? ` / ${formatInt(totalSteps)}` : ""}; latest durable checkpoint{" "}
            <code>{data.latest ?? "none"}</code>. The session ended without a terminal
            status. Resume with{" "}
            <code>python -m t4llm supervise --config configs/python-sft.yaml</code>.
          </div>
        )}

        {runTerminal && (
          <div className={`banner ${hbStatus === "fatal" || hbStatus === "push_failed" ? "idle" : "good"}`}>
            <strong>Run ended: {hbStatus}.</strong> Status{" "}
            <code>{hbStatus}</code> at step {formatInt(currentStep)}
            {totalSteps ? ` / ${formatInt(totalSteps)}` : ""}; latest durable checkpoint{" "}
            <code>{data.latest ?? "none"}</code>.{" "}
            {hbStatus === "data_exhausted"
              ? "The phase dataset was consumed before max_steps."
              : hbStatus === "fatal" || hbStatus === "push_failed"
                ? "Inspect the run events below before resuming."
                : "A time-budget stop is safe: resume from the checkpoint."}
          </div>
        )}

        <section className="card" aria-live="polite">
          <div className="chart-title">
            <h2>Training progress</h2>
            <Pill tone={runLive || hbStatus === "done" ? "good" : "warn"}>
              {runPaused || runTerminal
                ? `not live — stopped at step ${formatInt(currentStep)}`
                : currentStep > 0
                  ? "checkpoints durable on the Hub"
                  : "no checkpoint yet"}
            </Pill>
          </div>
          <div className="progress" aria-label="training progress">
            <div style={{ width: `${progress ?? 0}%` }} />
          </div>
          {epochPct !== undefined && (
            <div style={{ marginTop: 6 }}>
              <div className="progress" aria-label="epoch position">
                <div style={{ width: `${epochPct}%`, background: "linear-gradient(90deg, #a78bfa, #22d3ee)" }} />
              </div>
              <div className="muted mono" style={{ marginTop: 2 }}>
                epoch {epochIdx ?? 0} position: sample {formatInt(sampleIdx)} / {formatInt(totalSamples)} ({epochPct.toFixed(1)}%) · data cursor is part of the checkpoint
              </div>
            </div>
          )}
          <div className="muted mono" style={{ marginTop: 8 }}>
            LATEST → {data.latest ?? "—"} · phase {hb?.phase ?? "sft"} · status {displayStatus} · run{" "}
            {hb?.run_id ?? "—"} · loss is completion-masked SFT loss
          </div>
          <div className="muted mono" style={{ marginTop: 4 }}>
            last verified push {hb?.last_push_utc ? timeAgo(hb.last_push_utc) : "—"}
            {"  ·  "}session age {hb?.session_age_s ? `${Math.round(hb.session_age_s / 60)} min` : "—"}
          </div>
        </section>

        <div style={{ height: 14 }} />
        <Card
          title="Pipeline milestones"
          right={<Pill tone={publishDone ? "good" : "neutral"}>{publishDone ? "published" : "not yet published"}</Pill>}
        >
          <Stepper
            steps={[
              { label: "Data", state: "done", hint: "10 000 train + 500 held-out" },
              { label: "SFT", state: hbStatus === "done" ? "done" : runLive ? "current" : "paused", hint: runPaused || runTerminal ? `paused at ${currentStep}/${totalSteps ?? 625}` : `${currentStep}/${totalSteps ?? 625} steps` },
              { label: "Eval", state: evalDone ? "done" : "todo", hint: "held-out vs frozen base" },
              { label: "Export", state: exportDone ? "done" : "todo", hint: exportDone ? data.exportMarker?.trim() : "merged fp16 + f16 GGUF" },
              { label: "Publish", state: publishDone ? "done" : "todo", hint: "measured metrics only" },
            ]}
          />
        </Card>

        <div style={{ height: 14 }} />
        <section className="grid two">
          <Card
            title={
              <div className="tabs" role="tablist" aria-label="metric series">
                {([
                  ["loss", "Loss"],
                  ["ema", "EMA"],
                  ["grad", "Gradient norm"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={lossTab === key}
                    className={`tab ${lossTab === key ? "active" : ""}`}
                    onClick={() => setLossTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
            right={<span className="muted mono">{lossValues.length} steps</span>}
          >
            <Sparkline
              values={lossTab === "loss" ? lossValues : lossTab === "ema" ? emaValues : gradValues}
              color={lossTab === "loss" ? "#fb7185" : lossTab === "ema" ? "#22d3ee" : "#fbbf24"}
              label="loss series"
            />
            <div className="muted mono" style={{ marginTop: 6 }}>
              {lossTab === "loss" && `per-step loss${peakLoss !== undefined ? ` · peak ${peakLoss.toFixed(4)} @ step ${peakStep}` : ""}`}
              {lossTab === "ema" && "exponential moving average (α = 0.10)"}
              {lossTab === "grad" && "spike > 1.5× EMA × 20 steps triggers the automatic rollback"}
            </div>
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
            title="Cumulative supervised tokens"
            right={<span className="muted mono">{formatInt(cumulativeTokens.at(-1))} total</span>}
          >
            <AreaChart values={cumulativeTokens} color="#22d3ee" label="supervised tokens consumed" height={180} />
            <div className="muted" style={{ marginTop: 8 }}>
              Supervised-completion tokens only — the gradient sees every token, but this number is what
              the loss actually optimises. Not a benchmark.
            </div>
          </Card>
          <Card title="Runtime (from the Hub checkpoint)">
            <dl className="mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0 }}>
              <dt className="muted">GPU</dt><dd style={{ margin: 0 }}>{data.env?.gpu_name ?? "—"}{data.env?.compute_capability ? ` (cc ${data.env.compute_capability})` : ""}</dd>
              <dt className="muted">torch / CUDA</dt><dd style={{ margin: 0 }}>{data.env?.torch_version ?? "—"} / {data.env?.cuda_version ?? "—"}</dd>
              <dt className="muted">python</dt><dd style={{ margin: 0 }}>{data.env?.python ?? "—"}</dd>
              <dt className="muted">sdpa</dt><dd style={{ margin: 0 }}>{data.env?.sdpa ? "yes" : "unknown / no"}</dd>
              <dt className="muted">bf16 reported</dt><dd style={{ margin: 0 }}>{data.env?.bf16_reported ? "yes (policy: fp16 only)" : "no"}</dd>
              <dt className="muted">training-capable</dt><dd style={{ margin: 0 }}>{data.env?.training_capable ? "yes" : "unknown / no"}</dd>
              <dt className="muted">training SHA</dt><dd style={{ margin: 0 }}>{data.env?.git_sha ? data.env.git_sha.slice(0, 7) : "—"}</dd>
            </dl>
            {ts?.runtime_notes && ts.runtime_notes.length > 0 && (
              <ul className="muted" style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
                {ts.runtime_notes.map((note, i) => <li key={i}>{note}</li>)}
              </ul>
            )}
          </Card>
        </section>


        <div style={{ height: 14 }} />
        <section className="grid two">
          <Card title="Run health" right={<Pill tone={(ts?.rollbacks ?? 0) > 0 ? "warn" : "good"}>{ts?.rollbacks ?? 0} rollbacks</Pill>}>
            <dl className="mono" style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", margin: 0 }}>
              <dt className="muted">run id</dt><dd style={{ margin: 0 }}>{ts?.run_id ?? hb?.run_id ?? "—"}</dd>
              <dt className="muted">global step</dt><dd style={{ margin: 0 }}>{ts?.global_step ?? "—"} / {totalSteps ?? "—"}</dd>
              <dt className="muted">tier of latest ckpt</dt><dd style={{ margin: 0 }}>{ts?.tier ?? data.checkpoints[0]?.tier ?? "—"}</dd>
              <dt className="muted">optimizer reset</dt><dd style={{ margin: 0 }}>{ts?.optimizer_reset ? "YES (weights-only resume)" : "no (full state restored)"}</dd>
              <dt className="muted">OOM ladder stage</dt><dd style={{ margin: 0 }}>{ts?.oom_stage ?? 0}</dd>
              <dt className="muted">skipped steps</dt><dd style={{ margin: 0 }}>{ts?.skipped_steps ?? 0}</dd>
              <dt className="muted">resume divergence rollbacks</dt><dd style={{ margin: 0 }}>{ts?.rollbacks ?? 0}</dd>
            </dl>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Every number above comes from the Hub-published checkpoint manifest and trainer state — not from a local guess.
            </p>
          </Card>

          <Card title="Run events" right={<span className="muted mono">{eventRows.length} last</span>}>
            <table>
              <thead><tr><th>event</th><th>step</th><th>tier</th></tr></thead>
              <tbody>
                {eventRows.map((row, i) => (
                  <tr key={i}>
                    <td>{row.event}</td>
                    <td>{row.step ?? "—"}</td>
                    <td>{row.tier ?? "—"}</td>
                  </tr>
                ))}
                {eventRows.length === 0 && <tr><td colSpan={3} className="muted">No events pushed yet.</td></tr>}
              </tbody>
            </table>
            <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
              Events from <code>metrics.jsonl</code>: checkpoint writes, resumes, rollbacks, OOM ladder,
              divergence guard. The early-warning signal for a run going wrong.
            </p>
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
                    const isLatest = data.latest === ckpt.dir;
                    return (
                      <tr key={ckpt.dir} className={isLatest ? "latest-row" : undefined}>
                        <td className="mono">
                          {ckpt.step}
                          {isLatest && <span className="pill good" style={{ marginLeft: 6 }}>LATEST</span>}
                        </td>
                        <td>{ckpt.tier ?? "—"}</td>
                        <td>{ckpt.files}</td>
                        <td>{formatBytes(ckpt.bytes)}</td>
                        <td className="mono" title={ckpt.created_utc ?? undefined}>
                          {ckpt.created_utc ? timeAgo(ckpt.created_utc) : "—"}
                        </td>
                        <td>{adapter ? <CopyDigest value={adapter.sha256} /> : "—"}</td>
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
                    <td className="mono" title={item.date ?? undefined}>{item.date ? timeAgo(item.date) : "—"}</td>
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
              <dt className="muted">train sha256</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{data.dataManifest?.train_sha256 ? <CopyDigest value={data.dataManifest.train_sha256} /> : "—"}</dd>
              <dt className="muted">held-out sha256</dt><dd style={{ margin: 0, wordBreak: "break-all" }}>{data.dataManifest?.heldout_sha256 ? <CopyDigest value={data.dataManifest.heldout_sha256} /> : "—"}</dd>
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
        {evalRows.length > 0 ? (
          <Card
            title="Evaluation — held-out results"
            right={<Pill tone="good">measured</Pill>}
          >
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>UTC</th><th>run</th><th>step</th><th>domain ppl</th><th>base domain ppl</th>
                    <th>general ppl</th><th>base general ppl</th><th>regression</th>
                  </tr>
                </thead>
                <tbody>
                  {evalRows.map((row, i) => (
                    <tr key={i}>
                      <td className="mono">{row.utc}</td>
                      <td className="mono">{row.run}</td>
                      <td>{row.step}</td>
                      <td>{row.domainPpl}</td>
                      <td>{row.baseDomainPpl}</td>
                      <td>{row.generalPpl}</td>
                      <td>{row.baseGeneralPpl}</td>
                      <td>{row.regression}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              Rows read live from{" "}
              <a href="https://github.com/Ggboykxz/t4llm/blob/main/docs/EVAL.md">docs/EVAL.md</a> in the source
              repository, written by <code>t4llm eval</code> — never composed by the dashboard.
            </p>
          </Card>
        ) : (
          <Card title="Evaluation — not_measured" right={<Pill tone="warn">no benchmark yet</Pill>}>
            <p style={{ margin: 0 }}>
              No held-out perplexity, pass@1 or execution accuracy has been measured for this run yet.
              When the SFT run completes, <code>t4llm eval</code> scores the adapter against the frozen
              base on the 500-example held-out set and records the row in{" "}
              <a href="https://github.com/Ggboykxz/t4llm/blob/main/docs/EVAL.md">docs/EVAL.md</a>. Until that
              number exists, nothing here is a claim of quality — and nothing is “obviously” better than
              the base model.
            </p>
          </Card>
        )}

        <div style={{ height: 14 }} />
        <Card title="Operator runbook" right={<Pill tone="neutral">resume safely</Pill>}>
          <div className="mono" style={{ display: "grid", gap: 6 }}>
            <div><span className="muted"># continue the run (resumable after kill -9)</span></div>
            <div>python -m t4llm supervise --config configs/python-sft.yaml --time-budget 20m</div>
            <div><span className="muted"># held-out eval vs frozen base (required before any claim)</span></div>
            <div>python -m t4llm eval --config configs/python-sft.yaml --domain-set data/python-sft/heldout.jsonl</div>
            <div><span className="muted"># merged fp16 export + f16 GGUF, pushes to the Hub</span></div>
            <div>python -m t4llm export --config configs/python-sft.yaml --train-file data/python-sft/train.jsonl</div>
          </div>
          <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
            Checkpoint cadence: weights-only every ~180 s, full every ~360 s/20 steps. The Hub is durable
            truth; <code>LATEST</code> only moves after a complete, hash-verified upload.
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
            Build: <code>{buildSha}</code> · Next.js 15 · polling every 15 s · public endpoints only.
          </p>
          <p style={{ marginBottom: 0 }}>
            Downloads:{" "}
            <a href={`https://huggingface.co/${MODEL_REPO}/raw/main/metrics.jsonl`}>metrics.jsonl</a> ·{" "}
            <a href={`https://huggingface.co/${MODEL_REPO}`}>checkpoint files</a> ·{" "}
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
