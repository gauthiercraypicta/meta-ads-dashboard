'use client';

import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

// ─── Palette ──────────────────────────────────────────────────────────────────

const PALETTE = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
  '#06b6d4', '#f97316', '#84cc16', '#6366f1', '#14b8a6',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Build per-creative series: Map<creativeId, Map<frequency, value>>
type FreqMap = Map<string, Map<number, { ctr: number; cvr: number; impressions: number }>>;

function buildFreqMap(data: CreativeFrequencyPoint[]): FreqMap {
  const map: FreqMap = new Map();
  for (const p of data) {
    if (!map.has(p.creativeId)) map.set(p.creativeId, new Map());
    map.get(p.creativeId)!.set(p.frequency, {
      ctr: p.ctr,
      cvr: p.cvr,
      impressions: p.impressions,
    });
  }
  return map;
}

// Collect all unique frequency steps, sorted
function allFreqs(data: CreativeFrequencyPoint[]): number[] {
  return [...new Set(data.map((d) => d.frequency))].sort((a, b) => a - b);
}

// Build chart rows: [{freq, creativeId: value, ...}]
function buildRows(
  freqs: number[],
  creativeIds: string[],
  freqMap: FreqMap,
  metric: Metric,
): Record<string, number | null>[] {
  return freqs.map((f) => {
    const row: Record<string, number | null> = { freq: f };
    for (const id of creativeIds) {
      const entry = freqMap.get(id)?.get(f);
      row[id] = entry ? entry[metric] : null;
    }
    return row;
  });
}

// Detect fatigue breakpoint: first freq where delta vs previous > -15% relative
function detectBreakpoint(
  freqs: number[],
  freqMap: Map<number, number>,
  baseVal: number,
): number | null {
  for (let i = 1; i < freqs.length; i++) {
    const prev = freqMap.get(freqs[i - 1]);
    const curr = freqMap.get(freqs[i]);
    if (prev == null || curr == null || prev === 0) continue;
    const delta = (curr - prev) / prev;
    if (delta < -0.15) return freqs[i];
  }
  return null;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
  label?: number;
  metric: Metric;
  creativeNames: Map<string, string>;
  baselineByCreative: Map<string, number>;
}

function CustomTooltip({ active, payload, label, metric, creativeNames, baselineByCreative }: TooltipProps) {
  if (!active || !payload?.length || label == null) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1.5 max-w-[220px]">
      <p className="font-semibold text-gray-700">Fréquence {label.toFixed(1)}x</p>
      {payload.map((p) => {
        if (p.value == null) return null;
        const base = baselineByCreative.get(p.dataKey);
        const delta = base && base > 0 ? ((p.value - base) / base) * 100 : null;
        return (
          <div key={p.dataKey} className="border-l-2 pl-2" style={{ borderColor: p.color }}>
            <p className="truncate text-gray-800 font-medium">{creativeNames.get(p.dataKey) ?? p.dataKey}</p>
            <p className="text-gray-600">
              {metric.toUpperCase()}: <span className="font-mono">{pct(p.value)}</span>
              {delta != null && (
                <span className={`ml-1 ${delta < 0 ? 'text-red-500' : 'text-green-600'}`}>
                  ({delta >= 0 ? '+' : ''}{delta.toFixed(1)}%)
                </span>
              )}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreativeFatigueCurve({ data, metric: defaultMetric = 'ctr' }: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const creativeIds = useMemo(
    () => [...new Set(data.map((d) => d.creativeId))],
    [data],
  );
  const creativeNames = useMemo(
    () => new Map(data.map((d) => [d.creativeId, d.creativeName])),
    [data],
  );
  const freqMap   = useMemo(() => buildFreqMap(data), [data]);
  const freqs     = useMemo(() => allFreqs(data), [data]);
  const chartRows = useMemo(
    () => buildRows(freqs, creativeIds, freqMap, metric),
    [freqs, creativeIds, freqMap, metric],
  );

  // Baseline = value at freq 1.0 (or first freq) per creative
  const baselineByCreative = useMemo(() => {
    const map = new Map<string, number>();
    const firstFreq = freqs[0];
    for (const id of creativeIds) {
      const v = freqMap.get(id)?.get(firstFreq)?.[metric];
      if (v != null) map.set(id, v);
    }
    return map;
  }, [creativeIds, freqMap, freqs, metric]);

  // Global baseline (average across creatives at freq 1.0)
  const globalBaseline = useMemo(() => {
    const vals = [...baselineByCreative.values()];
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [baselineByCreative]);

  // Breakpoints per creative
  const breakpoints = useMemo(() => {
    const bp = new Map<string, number>();
    for (const id of creativeIds) {
      const perFreq = freqMap.get(id);
      if (!perFreq) continue;
      const idFreqMap = new Map<number, number>(
        freqs.map((f) => [f, perFreq.get(f)?.[metric] ?? 0]),
      );
      const pt = detectBreakpoint(freqs, idFreqMap, baselineByCreative.get(id) ?? 0);
      if (pt != null) bp.set(id, pt);
    }
    return bp;
  }, [creativeIds, freqMap, freqs, metric, baselineByCreative]);

  function toggleCreative(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée disponible
        </div>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d[metric])) * 1.2;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Courbe de Fatigue Créative</h3>
          <p className="text-xs text-gray-500 mt-0.5">Fréquence → performance · ⚠️ = point de rupture</p>
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

      {/* Interactive legend */}
      <div className="flex flex-wrap gap-2 mb-3">
        {creativeIds.map((id, i) => (
          <button
            key={id}
            onClick={() => toggleCreative(id)}
            className={`flex items-center gap-1.5 text-xs rounded-full px-2.5 py-0.5 border transition-all ${
              hidden.has(id)
                ? 'border-gray-200 text-gray-400 bg-gray-50'
                : 'border-transparent text-gray-700 bg-gray-100'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: hidden.has(id) ? '#d1d5db' : PALETTE[i % PALETTE.length] }}
            />
            <span className="max-w-[120px] truncate">{creativeNames.get(id)}</span>
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartRows} margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
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
            content={
              <CustomTooltip
                metric={metric}
                creativeNames={creativeNames}
                baselineByCreative={baselineByCreative}
              />
            }
          />

          {/* Global baseline */}
          {globalBaseline != null && (
            <ReferenceLine
              y={globalBaseline}
              stroke="#9ca3af"
              strokeDasharray="5 3"
              label={{ value: `Baseline f1.0`, position: 'insideTopRight', fill: '#9ca3af', fontSize: 9 }}
            />
          )}

          {/* Lines per creative */}
          {creativeIds.map((id, i) => (
            <Line
              key={id}
              dataKey={id}
              name={creativeNames.get(id) ?? id}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={hidden.has(id) ? 0 : 2}
              dot={{ r: 3, fill: PALETTE[i % PALETTE.length] }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              hide={hidden.has(id)}
            />
          ))}

          {/* Breakpoint dots */}
          {[...breakpoints.entries()].map(([id, freq]) => {
            if (hidden.has(id)) return null;
            const i = creativeIds.indexOf(id);
            const row = chartRows.find((r) => r.freq === freq);
            const val = row?.[id] as number | null;
            if (val == null) return null;
            return (
              <ReferenceDot
                key={`bp-${id}`}
                x={freq}
                y={val}
                r={8}
                fill="#ef4444"
                fillOpacity={0.85}
                stroke="white"
                strokeWidth={2}
                label={{ value: '⚠️', position: 'top', fontSize: 12 }}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
