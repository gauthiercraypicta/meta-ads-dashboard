'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FunnelData {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  spend: number;
}

export interface IndustryBenchmarks {
  ctr: number; // ex: 0.009 = 0.9%
  cvr: number; // ex: 0.10 = 10%
}

interface Props {
  data: FunnelData;
  benchmarks?: IndustryBenchmarks;
}

const DEFAULT_BENCHMARKS: IndustryBenchmarks = { ctr: 0.009, cvr: 0.10 };

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtBig(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k`;
  return `${Math.round(v)}`;
}

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M€`;
  if (v >= 1_000)     return `${Math.round(v / 1_000)}k€`;
  return `${v.toFixed(0)}€`;
}

function fmtPct(v: number): string {
  if (v < 0.001) return `${(v * 100).toFixed(3)}%`;
  if (v < 0.01)  return `${(v * 100).toFixed(2)}%`;
  return `${(v * 100).toFixed(1)}%`;
}

// ─── SVG Funnel geometry ──────────────────────────────────────────────────────

const SVG_W    = 400;
const STEP_H   = 68;
const GAP_H    = 44; // space between steps for conversion rate label
const PAD_TOP  = 6;

/**
 * Scaled funnel width for a step.
 * Uses sqrt scaling so even tiny conversion rates remain visible.
 * Returns a value in SVG units (0 – SVG_W).
 */
function funnelW(value: number, max: number, minFrac = 0.20): number {
  if (!max || !value) return SVG_W * minFrac;
  const frac = Math.max(minFrac, minFrac + (1 - minFrac) * Math.sqrt(value / max));
  return SVG_W * Math.min(frac, 0.96);
}

/** SVG polygon points for a centred trapezoid. */
function poly(yTop: number, wTop: number, wBot: number): string {
  const xl  = (SVG_W - wTop) / 2;
  const xr  = (SVG_W + wTop) / 2;
  const xlb = (SVG_W - wBot) / 2;
  const xrb = (SVG_W + wBot) / 2;
  return `${xl},${yTop} ${xr},${yTop} ${xrb},${yTop + STEP_H} ${xlb},${yTop + STEP_H}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConversionFunnelVisual({ data, benchmarks = DEFAULT_BENCHMARKS }: Props) {
  const { impressions, clicks, conversions, revenue, spend } = data;

  const ctr  = impressions > 0 ? clicks / impressions       : 0;
  const cvr  = clicks      > 0 ? conversions / clicks       : 0;
  const roas = spend        > 0 ? revenue / spend            : 0;
  const cpa  = conversions  > 0 ? spend / conversions        : 0;

  const ctrOk  = ctr  >= benchmarks.ctr;
  const cvrOk  = cvr  >= benchmarks.cvr;
  const roasOk = roas >= 2;

  // Widths
  const w1 = funnelW(impressions, impressions, 0.94); // always ~full width
  const w2 = funnelW(clicks,      impressions, 0.20);
  const w3 = funnelW(conversions, impressions, 0.14);
  const w4 = w3 * (roasOk ? 1.0 : 0.85);             // revenue bar slightly narrower on bad ROAS

  // Y positions
  const y1 = PAD_TOP;
  const y2 = y1 + STEP_H + GAP_H;
  const y3 = y2 + STEP_H + GAP_H;
  const y4 = y3 + STEP_H + GAP_H;
  const totalH = y4 + STEP_H + PAD_TOP;

  // Colours
  const col1 = '#3b82f6';                           // impressions  — blue
  const col2 = ctrOk  ? '#6366f1' : '#f97316';     // clicks       — indigo / orange
  const col3 = cvrOk  ? '#10b981' : '#ef4444';     // conversions  — green / red
  const col4 = roasOk ? '#059669' : '#f59e0b';     // revenue      — green / amber

  // Mid-X of funnel for arrows
  const mx = SVG_W / 2;

  // Helper: label at mid-gap between two steps
  const gapY = (stepY: number) => stepY + STEP_H; // top of gap

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Funnel de Conversion</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {fmtBig(impressions)} impressions &rarr; {fmtBig(conversions)} conversions
          </p>
        </div>
        <div className={`text-right`}>
          <p className="text-[10px] text-gray-400 uppercase tracking-wide">ROAS</p>
          <p className={`text-xl font-bold font-mono ${roasOk ? 'text-green-600' : roas >= 1.5 ? 'text-orange-500' : 'text-red-500'}`}>
            {roas.toFixed(2)}x
          </p>
        </div>
      </div>

      {/* SVG Funnel */}
      <svg
        viewBox={`0 0 ${SVG_W} ${totalH}`}
        className="w-full"
        style={{ maxHeight: 380 }}
        aria-label="Funnel de conversion"
      >
        {/* ── Step 1: Impressions ── */}
        <polygon points={poly(y1, w1, w2)} fill={col1} />
        {/* Label */}
        <text x={mx} y={y1 + 22} textAnchor="middle" fill="white" fontSize={11} fontWeight="500" opacity={0.9}>
          Impressions
        </text>
        <text x={mx} y={y1 + 46} textAnchor="middle" fill="white" fontSize={20} fontWeight="700">
          {fmtBig(impressions)}
        </text>

        {/* ── Gap 1 → CTR ── */}
        {(() => {
          const gy = gapY(y1);
          return (
            <>
              <line x1={mx} y1={gy} x2={mx} y2={gy + GAP_H - 2} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="3,3" />
              <polygon points={`${mx - 5},${gy + GAP_H - 10} ${mx + 5},${gy + GAP_H - 10} ${mx},${gy + GAP_H - 2}`} fill="#d1d5db" />
              {/* Rate badge */}
              <rect x={mx - 52} y={gy + 9} width={104} height={26} rx={13} fill={ctrOk ? '#d1fae5' : '#fff7ed'} />
              <text x={mx} y={gy + 27} textAnchor="middle" fill={ctrOk ? '#065f46' : '#9a3412'} fontSize={11} fontWeight="700">
                CTR {fmtPct(ctr)} {ctrOk ? '✓' : '↓'} · bench {fmtPct(benchmarks.ctr)}
              </text>
            </>
          );
        })()}

        {/* ── Step 2: Clics ── */}
        <polygon points={poly(y2, w2, w3)} fill={col2} />
        <text x={mx} y={y2 + 22} textAnchor="middle" fill="white" fontSize={11} fontWeight="500" opacity={0.9}>
          Clics
        </text>
        <text x={mx} y={y2 + 46} textAnchor="middle" fill="white" fontSize={20} fontWeight="700">
          {fmtBig(clicks)}
        </text>

        {/* ── Gap 2 → CVR ── */}
        {(() => {
          const gy = gapY(y2);
          return (
            <>
              <line x1={mx} y1={gy} x2={mx} y2={gy + GAP_H - 2} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="3,3" />
              <polygon points={`${mx - 5},${gy + GAP_H - 10} ${mx + 5},${gy + GAP_H - 10} ${mx},${gy + GAP_H - 2}`} fill="#d1d5db" />
              <rect x={mx - 52} y={gy + 9} width={104} height={26} rx={13} fill={cvrOk ? '#d1fae5' : '#fff7ed'} />
              <text x={mx} y={gy + 27} textAnchor="middle" fill={cvrOk ? '#065f46' : '#9a3412'} fontSize={11} fontWeight="700">
                CVR {fmtPct(cvr)} {cvrOk ? '✓' : '↓'} · bench {fmtPct(benchmarks.cvr)}
              </text>
            </>
          );
        })()}

        {/* ── Step 3: Conversions ── */}
        <polygon points={poly(y3, w3, w4)} fill={col3} />
        <text x={mx} y={y3 + 22} textAnchor="middle" fill="white" fontSize={11} fontWeight="500" opacity={0.9}>
          Conversions
        </text>
        <text x={mx} y={y3 + 46} textAnchor="middle" fill="white" fontSize={20} fontWeight="700">
          {fmtBig(conversions)}
        </text>

        {/* ── Gap 3 → ROAS ── */}
        {(() => {
          const gy = gapY(y3);
          const label = `ROAS ${roas.toFixed(2)}x ${roasOk ? '✓' : '↓'}`;
          return (
            <>
              <line x1={mx} y1={gy} x2={mx} y2={gy + GAP_H - 2} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="3,3" />
              <polygon points={`${mx - 5},${gy + GAP_H - 10} ${mx + 5},${gy + GAP_H - 10} ${mx},${gy + GAP_H - 2}`} fill="#d1d5db" />
              <rect x={mx - 44} y={gy + 9} width={88} height={26} rx={13} fill={roasOk ? '#d1fae5' : '#fef3c7'} />
              <text x={mx} y={gy + 27} textAnchor="middle" fill={roasOk ? '#065f46' : '#92400e'} fontSize={11} fontWeight="700">
                {label}
              </text>
            </>
          );
        })()}

        {/* ── Step 4: Revenue ── */}
        <polygon points={poly(y4, w4, w4 * 0.94)} fill={col4} />
        <text x={mx} y={y4 + 22} textAnchor="middle" fill="white" fontSize={11} fontWeight="500" opacity={0.9}>
          Revenue
        </text>
        <text x={mx} y={y4 + 46} textAnchor="middle" fill="white" fontSize={20} fontWeight="700">
          {fmtMoney(revenue)}
        </text>
      </svg>

      {/* ── KPI summary strip ── */}
      <div className="grid grid-cols-4 gap-0 mt-3 border-t border-gray-100 pt-3">
        {[
          { label: 'Dépenses',  value: fmtMoney(spend),             color: 'text-gray-700' },
          { label: 'CPA',       value: cpa > 0 ? fmtMoney(cpa) : '—', color: 'text-gray-700' },
          { label: 'CVR',       value: fmtPct(cvr),                  color: cvrOk  ? 'text-green-600' : 'text-red-500' },
          { label: 'ROAS',      value: `${roas.toFixed(2)}x`,         color: roasOk ? 'text-green-600' : roas >= 1.5 ? 'text-orange-500' : 'text-red-500' },
        ].map(({ label, value, color }, i) => (
          <div key={label} className={`text-center ${i > 0 ? 'border-l border-gray-100' : ''}`}>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
            <p className={`text-sm font-bold font-mono ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Diagnostic alerts ── */}
      {(!ctrOk || !cvrOk) && (
        <div className="mt-3 space-y-1.5">
          {!ctrOk && (
            <div className="flex items-center gap-2 text-xs bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-3 py-2">
              ⚠️ CTR sous benchmark ({fmtPct(benchmarks.ctr)}) — vérifier créatifs ou ciblage audience
            </div>
          )}
          {!cvrOk && (
            <div className="flex items-center gap-2 text-xs bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-3 py-2">
              ⚠️ CVR sous benchmark ({fmtPct(benchmarks.cvr)}) — vérifier landing page / offre
            </div>
          )}
        </div>
      )}
    </div>
  );
}
