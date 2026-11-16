"use client";

import { useId, useState, type ReactNode } from "react";

export function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="chart-title">
        <h2>{title}</h2>
        {right ? <div>{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: ReactNode }) {
  return (
    <div className="card">
      <h2>{label}</h2>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function CopyDigest({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button className="copy-btn" onClick={copy} title="Copy SHA-256">
      {copied ? "copied ✓" : value.slice(0, 12) + "…"}
    </button>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = tone === "neutral" ? "pill" : `pill ${tone}`;
  return <span className={cls}>{children}</span>;
}

export function Skeleton({ height = 18, width = "100%" }: { height?: number; width?: string }) {
  return <div className="skeleton" style={{ height, width }} aria-hidden="true" />;
}

export function Sparkline({
  values,
  color = "#22d3ee",
  height = 150,
  label,
  yDomain,
}: {
  values: number[];
  color?: string;
  height?: number;
  label?: string;
  yDomain?: [number, number];
}) {
  const width = 640;
  const padding = 14;
  const gradientId = useId();
  if (values.length === 0) {
    return <div className="muted">No data points yet.</div>;
  }
  const lo = yDomain?.[0] ?? Math.min(...values);
  const hi = yDomain?.[1] ?? Math.max(...values);
  const range = hi - lo || 1;
  const stepX = (width - padding * 2) / Math.max(1, values.length - 1);
  const points = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = padding + (1 - (v - lo) / range) * (height - padding * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height - padding} L${padding},${height - padding} Z`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const last = points[points.length - 1];
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "sparkline"}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last[0]} cy={last[1]} r={3.6} fill={color} stroke="#070b16" strokeWidth={1.2} />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#263056" />
      </svg>
      <div className="muted mono" style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span>min {min.toPrecision(4)}</span>
        <span>latest {values[values.length - 1].toPrecision(4)}</span>
        <span>max {max.toPrecision(4)}</span>
      </div>
    </div>
  );
}
