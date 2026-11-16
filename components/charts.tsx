"use client";

import { useId, useState } from "react";

/** SVG area chart with gridlines, gradient fill, last-point dot and a hover
 *  crosshair showing the exact value. Used for long, monotonic series. */
export function AreaChart({
  values,
  color = "#22d3ee",
  height = 180,
  unit = "",
  label,
}: {
  values: number[];
  color?: string;
  height?: number;
  unit?: string;
  label?: string;
}) {
  const width = 640;
  const pad = { left: 46, right: 10, top: 12, bottom: 22 };
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  if (values.length === 0) {
    return <div className="muted">No data points yet.</div>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(Math.abs(max) * 0.1, 1e-6);
  const mid = (min + max) / 2;

  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const stepX = plotW / Math.max(1, values.length - 1);
  const y = (v: number) => pad.top + (1 - (v - min) / range) * plotH;
  const points = values.map((v, i) => [pad.left + i * stepX, y(v)] as const);
  const line = points.map(([x, yy], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${height - pad.bottom} L${pad.left},${height - pad.bottom} Z`;

  const fmt = (v: number) =>
    Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : v.toPrecision(4);

  const hoverPoint = hover !== null ? points[hover] : null;
  const labelX = hoverPoint ? Math.min(Math.max(hoverPoint[0] + 10, pad.left + 4), width - 130) : 0;

  return (
    <svg
      className="chart"
      style={{ height }}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label ?? "series"}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const scaleX = ((e.clientX - rect.left) / rect.width) * width;
        const i = Math.round((scaleX - pad.left) / stepX);
        setHover(Math.max(0, Math.min(values.length - 1, i)));
      }}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.34" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[min, mid, max].map((v, i) => (
        <g key={i}>
          <line
            x1={pad.left}
            y1={y(v)}
            x2={width - pad.right}
            y2={y(v)}
            stroke="#263056"
            strokeDasharray={i === 1 ? "3 4" : undefined}
          />
          <text
            x={pad.left - 6}
            y={y(v) + 3}
            textAnchor="end"
            fill="#8f9ac4"
            fontSize="9"
            fontFamily="ui-monospace, monospace"
          >
            {fmt(v)}
            {unit}
          </text>
        </g>
      ))}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      {/* last point dot */}
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={4.5}
        fill={color}
        stroke="#070b16"
        strokeWidth={1.5}
      />
      {/* hover crosshair */}
      {hover !== null && hoverPoint && (
        <g>
          <line
            x1={hoverPoint[0]}
            y1={pad.top}
            x2={hoverPoint[0]}
            y2={height - pad.bottom}
            stroke="#4d5b8f"
            strokeDasharray="2 3"
          />
          <circle cx={hoverPoint[0]} cy={hoverPoint[1]} r={4} fill={color} stroke="#070b16" />
          <rect x={labelX} y={pad.top + 2} width={120} height={20} rx={5} fill="#141b34" stroke="#263056" />
          <text
            x={labelX + 8}
            y={pad.top + 16}
            fill="#e9edfb"
            fontSize="10"
            fontFamily="ui-monospace, monospace"
          >
            {fmt(values[hover])}
            {unit} · pt {hover + 1}
          </text>
        </g>
      )}
      <text x={pad.left} y={height - 6} fill="#8f9ac4" fontSize="9" fontFamily="ui-monospace, monospace">
        step 1
      </text>
      <text
        x={width - pad.right}
        y={height - 6}
        textAnchor="end"
        fill="#8f9ac4"
        fontSize="9"
        fontFamily="ui-monospace, monospace"
      >
        step {values.length}
      </text>
    </svg>
  );
}
