# t4llm-dashboard

Live, read-only dashboard for the [t4llm](https://github.com/Ggboykxz/t4llm) Python SFT run of
[Qwen3-1.7B-Base](https://huggingface.co/Qwen/Qwen3-1.7B-Base) on one T4.

**Live:** <https://ggboykxz.github.io/t4llm-dashboard/>

Next.js 15, static export, React 19, no back end, no database, **no tokens**. The page polls the
**public** Hugging Face and GitHub APIs every 15 seconds:

| Card | Source | Endpoint |
|---|---|---|
| Training progress, loss, EMA, grad-norm, tok/s, VRAM | HF model repo `Ggboykxz/t4llm-python-sft` | `raw/main/heartbeat.json`, `raw/main/metrics.jsonl` |
| Checkpoint table | HF model repo | `api/models/.../tree/main?recursive=true`, `LATEST`, `<ckpt>/manifest.json` (row badge for `LATEST`, relative age, copy-to-clipboard SHA-256) |
| Cumulative supervised tokens | HF model repo | `raw/main/metrics.jsonl` (gridline chart) |
| Runtime (GPU, torch, CUDA, training SHA) | HF model repo | `raw/main/LATEST/env.json` + `trainer_state.json` (`runtime_notes`) |
| Held-out evaluation rows | GitHub source repo | `raw.githubusercontent.com/Ggboykxz/t4llm/main/docs/EVAL.md` (table parsed; never composed) |
| Data split + digests | HF dataset repo `Ggboykxz/t4llm-python-data` | `raw/main/MANIFEST.json`, tree |
| Source backup pointer | HF repo `Ggboykxz/t4llm-source` | `raw/main/backup/LATEST.json` |
| Commit feed + repo health | GitHub + HF | public REST endpoints |

Nothing is hard-coded about the numbers: they reflect the last verified push on the Hub, which is
the same durability contract the training loop uses (`kill -9` can cost at most one push cadence).

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
```

## Build, smoke, preview

```bash
npm run build      # static export to ./out
npm run smoke      # structural + token-leak checks on ./out
npm run preview    # serves ./out locally
```

## Deploy

`.github/workflows/deploy.yml` builds with `NEXT_PUBLIC_BASE_PATH=/t4llm-dashboard` and publishes
to GitHub Pages on every push to `main`. `actions/configure-pages@v5` with `enablement: true` turns
Pages on automatically for the repo.

## Reliability notes

- A fetch failure renders that card as an error and keeps the last good value for the rest; the page never throws.
- "Live" means "as fresh as the last public push"; a preempted Colab cell makes the heartbeat go stale and the banner turns amber/red — by design.
- Evaluation rows are parsed from `docs/EVAL.md`; until a held-out eval is measured, the card says **not_measured**.
- Operator runbook card: exact restart/eval/export commands.
- Build SHA shown in the footer (`NEXT_PUBLIC_BUILD_SHA`), 15 s stale-while-error polling with a visible countdown, copy buttons on all digests.
- Epoch position bar (sample X / N from the checkpoint cursor), peak-loss annotation, Open Graph card (`public/opengraph-image.png`).

## Licence

Apache-2.0 (see `LICENSE`, `NOTICE`). Base model Qwen3-1.7B-Base is Apache-2.0; training data is
ODC-BY-1.0 (attribution) — see the
[data repo](https://huggingface.co/datasets/Ggboykxz/t4llm-python-data) `NOTICE`.
