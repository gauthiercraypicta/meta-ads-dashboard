'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreativeFrequencyPoint {
  creativeId: string;
  creativeName: string;
  frequency: number;   // 1.0 → 5.0+, paliers de 0.5
  ctr: number;         // %
  cvr: number;         // %
  impressions: number;
}

type Metric = 'ctr' | 'cvr';

interface Props {
  data: CreativeFrequencyPoint[];
  metric?: Metric;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AggBucket {
  totalWeighted: number;
  totalImpressions: number;
}

/** Aggregate all creatives into one curve, weighted by impressions */
function buildAggregatedRows(
  data: CreativeFrequencyPoint[],
  metric: Metric,
): { freq: number; value: number }[] {
  const buckets = new Map<number, AggBucket>();

  for (const p of data) {
    const existing = buckets.get(p.frequency) ?? { totalWeighted: 0, totalImpressions: 0 };
    existing.totalWeighted += p[metric] * p.impressions;
    existing.totalImpressions += p.impressions;
    buckets.set(p.frequency, existing);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([freq, b]) => ({
      freq,
      value: b.totalImpressions > 0 ? b.totalWeighted / b.totalImpressions : 0,
    }));
}

/** Detect fatigue breakpoint: first freq where delta vs previous > -15% relative */
function detectBreakpoint(rows: { freq: number; value: number }[]): number | null {
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].value;
    const curr = rows[i].value;
    if (prev === 0) continue;
    const delta = (curr - prev) / prev;
    if (delta < -0.15) return rows[i].freq;
  }
  return null;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: number;
  metric: Metric;
  baseline: number | null;
}

function CustomTooltip({ active, payload, label, metric, baseline }: TooltipProps) {
  if (!active || !payload?.length || label == null) return null;
  const val = payload[0].value;
  if (val == null) return null;
  const delta = baseline && baseline > 0 ? ((val - baseline) / baseline) * 100 : null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-700">Fréquence {label.toFixed(1)}x</p>
      <p className="text-gray-600">
        {metric.toUpperCase()}: <span className="font-mono">{pct(val)}</span>
        {delta != null && (
          <span className={`ml-1 ${delta < 0 ? 'text-red-500' : 'text-green-600'}`}>
            ({delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs baseline)
          </span>
        )}
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreativeFatigueCurve({ data, metric: defaultMetric = 'ctr' }: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);

  const rows = useMemo(() => buildAggregatedRows(data, metric), [data, metric]);

  const baseline = rows.length > 0 ? rows[0].value : null;

  const breakpointFreq = useMemo(() => detectBreakpoint(rows), [rows]);
  const breakpointRow = breakpointFreq != null ? rows.find((r) => r.freq === breakpointFreq) : null;

  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée disponible
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...rows.map((r) => r.value)) * 1.2;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Courbe de Fatigue Créative</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Moyenne pondérée toutes créas · Fréquence → performance
            {breakpointFreq != null && (
              <span className="text-red-500 ml-1">· Point de rupture à {breakpointFreq.toFixed(1)}x</span>
            )}
          </p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['ctr', 'cvr'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                metric === m ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={rows} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="freq"
            tickFormatter={(v) => `${v.toFixed(1)}x`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Fréquence', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }}
          />
          <YAxis
            domain={[0, maxVal]}
            tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
          />
          <Tooltip
            content={<CustomTooltip metric={metric} baseline={baseline} />}
          />

          {/* Baseline at freq 1.0 */}
          {baseline != null && (
            <ReferenceLine
              y={baseline}
              stroke="#9ca3af"
              strokeDasharray="5 3"
              label={{ value: 'Baseline f1.0', position: 'insideTopRight', fill: '#9ca3af', fontSize: 9 }}
            />
          )}

          {/* Single aggregated line */}
          <Line
            dataKey="value"
            name={`${metric.toUpperCase()} moyen`}
            stroke="#3b82f6"
            strokeWidth={2.5}
            dot={{ r: 4, fill: '#3b82f6', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />

          {/* Breakpoint dot */}
          {breakpointRow && (
            <ReferenceDot
              x={breakpointFreq!}
              y={breakpointRow.value}
              r={8}
              fill="#ef4444"
              fillOpacity={0.85}
              stroke="white"
              strokeWidth={2}
              label={{ value: '⚠️', position: 'top', fontSize: 14 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
