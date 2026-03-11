'use client';

import React, { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { GroupedCreative } from '@/types/creative';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  creatives: GroupedCreative[];
}

interface RowData {
  name: string;
  fullName: string;
  reach: number;
  incrementalReach: number;
  cumulativeReach: number;
  cumulativePct: number;      // 0–100
  spend: number;
  costPerReach: number;       // CPR = spend / reach
  frequency: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
  payload: RowData;
}

interface TipProps {
  active?: boolean;
  payload?: TipPayloadEntry[];
  label?: string;
}

function CustomTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1.5 max-w-[240px]">
      <p className="font-semibold text-gray-800 truncate">{row.fullName}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
        <span>Reach</span>
        <span className="text-right font-mono">{fmtNum(row.reach)}</span>
        <span>Reach incrémental</span>
        <span className="text-right font-mono">{fmtNum(row.incrementalReach)}</span>
        <span>Couverture cumulée</span>
        <span className="text-right font-mono">{row.cumulativePct.toFixed(1)}%</span>
        <span>Coût / reach</span>
        <span className="text-right font-mono">{row.costPerReach.toFixed(3)}€</span>
        <span>Fréquence</span>
        <span className="text-right font-mono">{row.frequency.toFixed(1)}x</span>
        <span>Spend</span>
        <span className="text-right font-mono">{fmtNum(row.spend)}€</span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IncrementalReachChart({ creatives }: Props) {
  const rows = useMemo((): RowData[] => {
    // Only creatives with reach > 0
    const withReach = creatives.filter((c) => c.reach > 0);
    if (withReach.length === 0) return [];

    // Sort by CPR ascending (most efficient first)
    const sorted = [...withReach].sort((a, b) => {
      const cprA = a.spend > 0 ? a.spend / a.reach : Infinity;
      const cprB = b.spend > 0 ? b.spend / b.reach : Infinity;
      return cprA - cprB;
    });

    // Sum of all individual reaches (with overlap)
    const rawTotal = sorted.reduce((s, c) => s + c.reach, 0);

    // Estimate total unique reach using average frequency
    // Total impressions / avg frequency ≈ unique reach
    const totalImpressions = sorted.reduce(
      (s, c) => s + c.variants.reduce((vs, v) => vs + v.impressions, 0),
      0,
    );
    const avgFreq = totalImpressions > 0
      ? totalImpressions / rawTotal
      : 1;

    // Estimate overlap: if avgFreq across creatives > 1, there's cross-creative overlap
    // We use a simple diminishing returns model
    const estimatedUniqueReach = rawTotal / Math.max(avgFreq, 1);

    let cumulative = 0;

    return sorted.map((c) => {
      // Estimate incremental reach: apply diminishing factor based on position
      const overlapFactor = estimatedUniqueReach > 0
        ? Math.max(0, 1 - cumulative / estimatedUniqueReach)
        : 1;
      const incremental = c.reach * overlapFactor;

      cumulative += incremental;
      const cumulativePct = estimatedUniqueReach > 0
        ? Math.min((cumulative / estimatedUniqueReach) * 100, 100)
        : 0;

      return {
        name: truncate(c.creativeName || c.rawName, 14),
        fullName: c.creativeName || c.rawName,
        reach: c.reach,
        incrementalReach: Math.round(incremental),
        cumulativeReach: Math.round(cumulative),
        cumulativePct,
        spend: c.spend,
        costPerReach: c.spend > 0 && c.reach > 0 ? c.spend / c.reach : 0,
        frequency: c.frequency,
      };
    });
  }, [creatives]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée de reach disponible
        </div>
      </div>
    );
  }

  const maxReach = Math.max(...rows.map((r) => r.incrementalReach)) * 1.15;

  // Summary stats
  const totalReach = rows[rows.length - 1]?.cumulativeReach ?? 0;
  const top3Pct = rows.length >= 3 ? rows[2].cumulativePct : rows[rows.length - 1]?.cumulativePct ?? 0;
  const avgCPR = rows.reduce((s, r) => s + r.costPerReach, 0) / rows.length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Couverture Incrémentale</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Créas triées par efficacité (CPR) · reach incrémental estimé
          </p>
        </div>
      </div>

      {/* KPI row */}
      <div className="flex gap-4 mb-4 mt-2">
        {[
          { label: 'Reach estimé total', value: fmtNum(totalReach) },
          { label: 'Top 3 créas', value: `${top3Pct.toFixed(0)}% du reach` },
          { label: 'CPR moyen', value: `${avgCPR.toFixed(3)}€` },
          { label: 'Créas actives', value: rows.length.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 40, bottom: 60, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={60}
          />
          <YAxis
            yAxisId="reach"
            domain={[0, maxReach]}
            tickFormatter={fmtNum}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Reach incrémental', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10, dx: -5 }}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 105]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Couverture cumulée', angle: 90, position: 'insideRight', fill: '#9ca3af', fontSize: 10, dx: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Bars: incremental reach */}
          <Bar
            yAxisId="reach"
            dataKey="incrementalReach"
            name="Reach incrémental"
            fill="#3b82f6"
            radius={[4, 4, 0, 0]}
            fillOpacity={0.85}
          />

          {/* Line: cumulative coverage % */}
          <Line
            yAxisId="pct"
            dataKey="cumulativePct"
            name="Couverture cumulée"
            stroke="#f59e0b"
            strokeWidth={2.5}
            dot={{ r: 3, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
