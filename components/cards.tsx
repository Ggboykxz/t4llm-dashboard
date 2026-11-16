"use client";

import type { ReactNode } from "react";

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

export function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <h2>{label}</h2>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  );
}

export function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const cls = tone === "neutral" ? "pill" : `pill ${tone}`;
  return <span className={cls}>{children}</span>;
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
  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "sparkline"}>
        <path d={area} fill={color} fillOpacity={0.12} />
        <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
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
