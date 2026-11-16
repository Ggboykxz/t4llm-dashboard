"use client";

/** SVG area chart with three gridlines and min/mid/max labels.
 *  Used for long, monotonic series (loss, cumulative tokens). */
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
  const pad = { left: 44, right: 8, top: 10, bottom: 20 };
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

  return (
    <svg className="chart" style={{ height }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "series"}>
      {[min, mid, max].map((v, i) => (
        <g key={i}>
          <line x1={pad.left} y1={y(v)} x2={width - pad.right} y2={y(v)} stroke="#263056" strokeDasharray={i === 1 ? "3 4" : undefined} />
          <text x={pad.left - 6} y={y(v) + 3} textAnchor="end" fill="#8b95c0" fontSize="9" fontFamily="ui-monospace, monospace">
            {fmt(v)}{unit}
          </text>
        </g>
      ))}
      <path d={area} fill={color} fillOpacity={0.14} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
      <text x={pad.left} y={height - 6} fill="#8b95c0" fontSize="9" fontFamily="ui-monospace, monospace">step 1</text>
      <text x={width - pad.right} y={height - 6} textAnchor="end" fill="#8b95c0" fontSize="9" fontFamily="ui-monospace, monospace">
        step {values.length}
      </text>
    </svg>
  );
}
