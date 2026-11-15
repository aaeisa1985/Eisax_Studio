import type { ChartData } from "@/lib/validation/projects";

interface SlideChartProps {
  chart: ChartData;
  accentHex?: string;
  goldHex?: string;
  titleColor?: string;
  textColor?: string;
  mutedColor?: string;
  surfaceBg?: string;
  borderColor?: string;
  rtl?: boolean;
}

const DEFAULT_PALETTE = ["#00A89E", "#D9A441", "#38BDF8", "#10B981", "#818CF8", "#F472B6"];

function formatValue(val: number, unit?: string): string {
  const rounded = Number.isInteger(val) ? String(val) : val.toFixed(1);
  if (!unit) return rounded;
  if (unit === "$" || unit === "€" || unit === "£") return `${unit}${rounded}`;
  if (unit === "%" || unit.startsWith("%")) return `${rounded}${unit}`;
  return `${rounded} ${unit}`;
}

export function SlideChart({
  chart,
  accentHex = "#00A89E",
  goldHex = "#D9A441",
  titleColor = "#0B253A",
  textColor = "#1E293B",
  mutedColor = "#64748B",
  surfaceBg = "rgba(255,255,255,0.65)",
  borderColor = "rgba(148,163,184,0.28)",
  rtl = false,
}: SlideChartProps) {
  const palette = [accentHex, goldHex, ...DEFAULT_PALETTE.slice(2)];
  const count = Math.min(chart.categories.length, chart.values.length);
  const categories = chart.categories.slice(0, count);
  const values = chart.values.slice(0, count).map((v) => (Number.isFinite(v) ? v : 0));

  const titleLine = chart.unit ? `${chart.title} (${chart.unit})` : chart.title;

  if (count < 2) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-xl border p-4 text-xs"
        style={{ background: surfaceBg, borderColor, color: mutedColor }}
      >
        Chart requires at least 2 data points.
      </div>
    );
  }

  return (
    <div
      dir={rtl ? "rtl" : "ltr"}
      className="flex h-full w-full flex-col justify-between rounded-xl border p-3 shadow-sm"
      style={{ background: surfaceBg, borderColor }}
    >
      <div
        className="mb-1.5 truncate text-xs font-semibold tracking-tight"
        style={{ color: titleColor }}
        title={titleLine}
      >
        {titleLine}
      </div>

      {chart.kind === "pie" ? (
        <PieSvg
          categories={categories}
          values={values}
          unit={chart.unit}
          palette={palette}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      ) : chart.kind === "line" ? (
        <LineSvg
          categories={categories}
          values={values}
          unit={chart.unit}
          accent={accentHex}
          gold={goldHex}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      ) : (
        <BarSvg
          categories={categories}
          values={values}
          unit={chart.unit}
          palette={palette}
          textColor={textColor}
          mutedColor={mutedColor}
        />
      )}
    </div>
  );
}

function BarSvg({
  categories,
  values,
  unit,
  palette,
  textColor,
  mutedColor,
}: {
  categories: string[];
  values: number[];
  unit?: string;
  palette: string[];
  textColor: string;
  mutedColor: string;
}) {
  const W = 340;
  const H = 190;
  const padL = 24;
  const padR = 14;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVal = Math.max(...values, 1);
  const slotW = plotW / categories.length;
  const barW = Math.min(36, slotW * 0.56);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Bar chart">
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padT + plotH * (1 - frac);
        return (
          <line
            key={frac}
            x1={padL}
            y1={y}
            x2={W - padR}
            y2={y}
            stroke={mutedColor}
            strokeOpacity={0.2}
            strokeDasharray="3 3"
          />
        );
      })}
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke={mutedColor} strokeOpacity={0.45} />

      {categories.map((cat, idx) => {
        const val = Math.max(0, values[idx] ?? 0);
        const barH = Math.max(3, (val / maxVal) * plotH);
        const x = padL + idx * slotW + (slotW - barW) / 2;
        const y = padT + plotH - barH;
        const fill = palette[idx % palette.length];
        const shortCat = cat.length > 10 ? `${cat.slice(0, 9)}…` : cat;
        return (
          <g key={`${cat}-${idx}`}>
            <rect x={x} y={y} width={barW} height={barH} rx={4} fill={fill} fillOpacity={0.92} />
            <text
              x={x + barW / 2}
              y={y - 5}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill={textColor}
            >
              {formatValue(val, unit)}
            </text>
            <text
              x={x + barW / 2}
              y={H - 12}
              textAnchor="middle"
              fontSize="9.5"
              fill={mutedColor}
            >
              {shortCat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineSvg({
  categories,
  values,
  unit,
  accent,
  gold,
  textColor,
  mutedColor,
}: {
  categories: string[];
  values: number[];
  unit?: string;
  accent: string;
  gold: string;
  textColor: string;
  mutedColor: string;
}) {
  const W = 340;
  const H = 190;
  const padL = 26;
  const padR = 20;
  const padT = 24;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const span = Math.max(1, maxVal - minVal);

  const pts = values.map((val, idx) => {
    const x =
      categories.length === 1
        ? padL + plotW / 2
        : padL + (idx / (categories.length - 1)) * plotW;
    const y = padT + plotH - ((val - minVal) / span) * plotH;
    return { x, y, val, cat: categories[idx] ?? "" };
  });

  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const firstPt = pts[0]!;
  const lastPt = pts[pts.length - 1]!;
  const area = `${firstPt.x.toFixed(1)},${(padT + plotH).toFixed(1)} ${polyline} ${lastPt.x.toFixed(1)},${(padT + plotH).toFixed(1)}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-label="Line chart">
      {[0.25, 0.5, 0.75, 1].map((frac) => {
        const y = padT + plotH * (1 - frac);
        return (
          <line
            key={frac}
            x1={padL}
            y1={y}
            x2={W - padR}
            y2={y}
            stroke={mutedColor}
            strokeOpacity={0.2}
            strokeDasharray="3 3"
          />
        );
      })}
      <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke={mutedColor} strokeOpacity={0.45} />
      <polygon points={area} fill={accent} fillOpacity={0.14} />
      <polyline points={polyline} fill="none" stroke={accent} strokeWidth={2.5} strokeLinejoin="round" />

      {pts.map((p, idx) => {
        const shortCat = p.cat.length > 9 ? `${p.cat.slice(0, 8)}…` : p.cat;
        return (
          <g key={`${p.cat}-${idx}`}>
            <circle cx={p.x} cy={p.y} r={4} fill={idx === pts.length - 1 ? gold : accent} stroke="#FFFFFF" strokeWidth={1.2} />
            <text
              x={p.x}
              y={p.y - 8}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="600"
              fill={textColor}
            >
              {formatValue(p.val, unit)}
            </text>
            <text x={p.x} y={H - 12} textAnchor="middle" fontSize="9.5" fill={mutedColor}>
              {shortCat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function PieSvg({
  categories,
  values,
  unit,
  palette,
  textColor,
  mutedColor,
}: {
  categories: string[];
  values: number[];
  unit?: string;
  palette: string[];
  textColor: string;
  mutedColor: string;
}) {
  const posValues = values.map((v) => Math.max(0, v));
  const total = posValues.reduce((sum, v) => sum + v, 0) || 1;
  const cx = 78;
  const cy = 78;
  const r = 56;
  const innerR = 28;

  let startAngle = -Math.PI / 2;
  const slices = categories.map((cat, idx) => {
    const val = posValues[idx] ?? 0;
    const angle = (val / total) * Math.PI * 2;
    const endAngle = startAngle + angle;
    const largeArc = angle > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    const ix1 = cx + innerR * Math.cos(endAngle);
    const iy1 = cy + innerR * Math.sin(endAngle);
    const ix2 = cx + innerR * Math.cos(startAngle);
    const iy2 = cy + innerR * Math.sin(startAngle);

    const d =
      angle >= Math.PI * 1.999
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`
        : `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${ix1.toFixed(2)} ${iy1.toFixed(2)} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2.toFixed(2)} ${iy2.toFixed(2)} Z`;

    startAngle = endAngle;
    const pct = Math.round((val / total) * 100);
    return { cat, val, pct, d, color: palette[idx % palette.length] };
  });

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 156 156" className="h-36 w-36 shrink-0" role="img" aria-label="Pie chart">
        {slices.map((s, idx) => (
          <path key={`${s.cat}-${idx}`} d={s.d} fill={s.color} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
        ))}
        <text x={cx} y={cy + 3} textAnchor="middle" fontSize="10" fontWeight="700" fill={textColor}>
          {unit === "%" ? "100%" : formatValue(total, unit)}
        </text>
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5 text-[11px]">
        {slices.map((s, idx) => (
          <div key={`${s.cat}-leg-${idx}`} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5" style={{ color: textColor }}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="truncate">{s.cat}</span>
            </span>
            <span className="shrink-0 font-semibold tabular-nums" style={{ color: mutedColor }}>
              {s.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
