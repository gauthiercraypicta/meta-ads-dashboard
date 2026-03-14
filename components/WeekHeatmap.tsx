'use client';

import { useState, useMemo } from 'react';
import { InsightData, ActionData } from '@/types/meta';
import { formatCurrency } from '@/lib/formatters';

// ─── Constants ────────────────────────────────────────────────────────────────

// DOW order: Mon → Sun (JS getDay(): 0=Sun, 1=Mon, …, 6=Sat)
const DOW_ORDER  = [1, 2, 3, 4, 5, 6, 0];
const DOW_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

type Metric = 'roas' | 'cpa' | 'conversions' | 'spend';

const METRIC_OPTIONS: { value: Metric; label: string }[] = [
  { value: 'roas',        label: 'ROAS'     },
  { value: 'cpa',         label: 'CPA'      },
  { value: 'conversions', label: 'Conv.'    },
  { value: 'spend',       label: 'Dépenses' },
];

// ─── Color palette (RGB tuples) ──────────────────────────────────────────────

const GRAY_50:   [number, number, number] = [249, 250, 251];
const GREEN_300: [number, number, number] = [134, 239, 172];
const GREEN_100: [number, number, number] = [220, 252, 231];
const RED_200:   [number, number, number] = [254, 202, 202];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PURCHASE_PRIORITY = [
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
] as const;

function getPurchaseValue(actions: ActionData[] | undefined): number {
  if (!actions) return 0;
  for (const type of PURCHASE_PRIORITY) {
    const hit = actions.find((a) => a.action_type === type);
    if (hit) return parseFloat(hit.value ?? '0') || 0;
  }
  return 0;
}

function lerp(t: number, from: [number, number, number], to: [number, number, number]): string {
  const c = (i: 0 | 1 | 2) => Math.round(from[i] + t * (to[i] - from[i]));
  return `rgb(${c(0)},${c(1)},${c(2)})`;
}

function avg(arr: number[]): number | null {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DowMetrics = {
  roas:        number | null;
  cpa:         number | null;
  conversions: number | null;
  spend:       number | null;
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  dailyData: InsightData[] | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeekHeatmap({ dailyData }: Props) {
  const [metric, setMetric] = useState<Metric>('roas');

  // ── Pre-compute all 4 metrics by DOW (last 30 days) ──────────────────────

  const byDowAll = useMemo((): Record<number, DowMetrics> | null => {
    if (!dailyData || dailyData.length === 0) return null;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const buckets: Record<number, {
      roas: number[]; cpa: number[]; conv: number[]; spend: number[];
    }> = {};
    for (let d = 0; d <= 6; d++) buckets[d] = { roas: [], cpa: [], conv: [], spend: [] };

    for (const day of dailyData) {
      if (!day.date_start) continue;
      // Parse date safely (avoid timezone offset issues)
      const dt = new Date(day.date_start + 'T00:00:00');
      if (dt < cutoff) continue;

      const dow   = dt.getDay();
      const spend = parseFloat(day.spend ?? '0') || 0;
      const conv  = getPurchaseValue(day.actions);
      const val   = getPurchaseValue(day.action_values);
      const roas  = spend > 0 ? val / spend : 0;
      const cpa   = conv > 0  ? spend / conv : 0;

      if (spend > 0)           buckets[dow].roas.push(roas);
      if (spend > 0 && conv > 0) buckets[dow].cpa.push(cpa);
      if (conv  > 0)           buckets[dow].conv.push(conv);
      if (spend > 0)           buckets[dow].spend.push(spend);
    }

    return Object.fromEntries(
      Object.entries(buckets).map(([d, b]) => [
        d,
        {
          roas:        avg(b.roas),
          cpa:         avg(b.cpa),
          conversions: avg(b.conv),
          spend:       avg(b.spend),
        },
      ])
    ) as Record<number, DowMetrics>;
  }, [dailyData]);

  // ── Select the active metric column ──────────────────────────────────────

  const byDow = useMemo((): Record<number, number | null> | null => {
    if (!byDowAll) return null;
    return Object.fromEntries(
      Object.entries(byDowAll).map(([d, v]) => [d, v[metric]])
    ) as Record<number, number | null>;
  }, [byDowAll, metric]);

  // ── Color scale ──────────────────────────────────────────────────────────

  const values  = byDow ? DOW_ORDER.map((d) => byDow[d]).filter((v): v is number => v !== null) : [];
  const minVal  = values.length ? Math.min(...values) : 0;
  const maxVal  = values.length ? Math.max(...values) : 1;

  function cellColor(val: number | null): string {
    if (val === null || maxVal === minVal) return `rgb(${GRAY_50.join(',')})`;
    const t = (val - minVal) / (maxVal - minVal);
    // CPA: low = good (green), high = bad (red)
    if (metric === 'cpa') return lerp(t, GREEN_100, RED_200);
    // ROAS / Conv / Spend: low = pale, high = green
    return lerp(t, GRAY_50, GREEN_300);
  }

  function formatVal(val: number | null): string {
    if (val === null) return '—';
    if (metric === 'roas')        return val.toFixed(2) + 'x';
    if (metric === 'cpa')         return formatCurrency(val);
    if (metric === 'conversions') return val.toFixed(1);
    if (metric === 'spend')       return formatCurrency(val);
    return '—';
  }

  if (!dailyData || dailyData.length === 0) return null;

  const activeLabel = METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? '';

  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Heatmap — Performance par jour de la semaine
          <span className="ml-1 font-normal text-gray-300 normal-case">(moy. 30 derniers jours)</span>
        </h2>

        {/* Metric selector */}
        <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-lg">
          {METRIC_OPTIONS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMetric(m.value)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                metric === m.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <div className="grid grid-cols-7 gap-2">
          {DOW_ORDER.map((dow, i) => {
            const val = byDow ? byDow[dow] : null;
            return (
              <div key={dow} className="flex flex-col items-center gap-1.5">
                {/* Day label */}
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
                  {DOW_LABELS[i]}
                </span>

                {/* Cell */}
                <div
                  className="w-full rounded-lg border border-gray-100/80 flex flex-col items-center justify-center py-5"
                  style={{ backgroundColor: cellColor(val) }}
                >
                  <span className="text-sm font-bold text-gray-800 leading-tight">
                    {formatVal(val)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-between mt-4 text-[10px] text-gray-400">
          <span className="flex items-center gap-1.5">
            <span
              className="w-4 h-2 rounded-sm inline-block flex-shrink-0"
              style={{ backgroundColor: metric === 'cpa' ? `rgb(${GREEN_100.join(',')})` : `rgb(${GRAY_50.join(',')})` }}
            />
            {metric === 'cpa' ? 'CPA bas — meilleur' : 'Faible'}
          </span>
          <span className="text-gray-300 font-medium">
            Moyenne / jour · {activeLabel}
          </span>
          <span className="flex items-center gap-1.5">
            {metric === 'cpa' ? 'CPA élevé — à surveiller' : 'Élevé — meilleur'}
            <span
              className="w-4 h-2 rounded-sm inline-block flex-shrink-0"
              style={{ backgroundColor: metric === 'cpa' ? `rgb(${RED_200.join(',')})` : `rgb(${GREEN_300.join(',')})` }}
            />
          </span>
        </div>
      </div>
    </section>
  );
}
