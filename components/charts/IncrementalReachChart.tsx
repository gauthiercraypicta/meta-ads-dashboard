'use client';

import React, { useEffect, useMemo, useState } from 'react';
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  datePreset?: string;
}

interface DailyRow {
  date: string;        // "DD/MM"
  fullDate: string;    // "YYYY-MM-DD"
  reach: number;
  spend: number;
  impressions: number;
  cumulativeReach: number;
  cumulativeSpend: number;
  cpr: number;         // cumulative spend / cumulative reach
}

interface ApiDay {
  spend: string;
  impressions: string;
  reach: string;
  frequency?: string;
  date_start?: string;
  date_stop?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

function fmtDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TipPayloadEntry {
  dataKey: string;
  value: number;
  color: string;
  payload: DailyRow;
}

interface TipProps {
  active?: boolean;
  payload?: TipPayloadEntry[];
}

function CustomTooltip({ active, payload }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1.5 max-w-[240px]">
      <p className="font-semibold text-gray-800">{row.fullDate}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600">
        <span>Reach du jour</span>
        <span className="text-right font-mono">{fmtNum(row.reach)}</span>
        <span>Dépense du jour</span>
        <span className="text-right font-mono">{fmtNum(row.spend)}€</span>
        <span>Reach cumulé</span>
        <span className="text-right font-mono">{fmtNum(row.cumulativeReach)}</span>
        <span>Dépense cumulée</span>
        <span className="text-right font-mono">{fmtNum(row.cumulativeSpend)}€</span>
        <span>CPR cumulé</span>
        <span className="text-right font-mono">{row.cpr.toFixed(3)}€</span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function IncrementalReachChart({ datePreset = 'last_30d' }: Props) {
  const [dailyData, setDailyData] = useState<ApiDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/daily?date_preset=${datePreset}`);
        const json = await res.json();
        if (!cancelled && json.data) {
          setDailyData(json.data);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [datePreset]);

  const rows = useMemo((): DailyRow[] => {
    if (dailyData.length === 0) return [];

    // Sort by date ascending
    const sorted = [...dailyData].sort((a, b) =>
      (a.date_start ?? '').localeCompare(b.date_start ?? ''),
    );

    let cumReach = 0;
    let cumSpend = 0;

    return sorted.map((d) => {
      const reach = parseFloat(d.reach) || 0;
      const spend = parseFloat(d.spend) || 0;
      const impressions = parseFloat(d.impressions) || 0;

      cumReach += reach;
      cumSpend += spend;

      return {
        date: d.date_start ? fmtDate(d.date_start) : '—',
        fullDate: d.date_start ?? '—',
        reach,
        spend,
        impressions,
        cumulativeReach: cumReach,
        cumulativeSpend: cumSpend,
        cpr: cumReach > 0 ? cumSpend / cumReach : 0,
      };
    });
  }, [dailyData]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Chargement des données de reach…
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée de reach disponible
        </div>
      </div>
    );
  }

  // Summary stats
  const totalReach = rows[rows.length - 1]?.cumulativeReach ?? 0;
  const totalSpend = rows[rows.length - 1]?.cumulativeSpend ?? 0;
  const globalCPR = totalReach > 0 ? totalSpend / totalReach : 0;
  const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
  const globalFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;
  const avgDailyReach = totalReach / rows.length;

  const maxDailyReach = Math.max(...rows.map((r) => r.reach)) * 1.15;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="mb-1">
        <h3 className="font-semibold text-gray-900 text-sm">Couverture Incrémentale — Compte</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Reach quotidien et couverture cumulée au niveau du compte
        </p>
      </div>

      {/* KPI row */}
      <div className="flex gap-4 mb-4 mt-2">
        {[
          { label: 'Reach total', value: fmtNum(totalReach) },
          { label: 'Reach moy/jour', value: fmtNum(avgDailyReach) },
          { label: 'CPR global', value: `${globalCPR.toFixed(3)}€` },
          { label: 'Fréquence', value: `${globalFrequency.toFixed(1)}x` },
        ].map(({ label, value }) => (
          <div key={label} className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</p>
            <p className="text-sm font-bold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 10, right: 40, bottom: 40, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#6b7280' }}
            angle={-35}
            textAnchor="end"
            interval={Math.max(0, Math.floor(rows.length / 15))}
            height={50}
          />
          <YAxis
            yAxisId="reach"
            domain={[0, maxDailyReach]}
            tickFormatter={fmtNum}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Reach / jour', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10, dx: -5 }}
          />
          <YAxis
            yAxisId="cumul"
            orientation="right"
            tickFormatter={fmtNum}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Reach cumulé', angle: 90, position: 'insideRight', fill: '#9ca3af', fontSize: 10, dx: 10 }}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Bars: daily reach */}
          <Bar
            yAxisId="reach"
            dataKey="reach"
            name="Reach quotidien"
            fill="#3b82f6"
            radius={[3, 3, 0, 0]}
            fillOpacity={0.8}
          />

          {/* Line: cumulative reach */}
          <Line
            yAxisId="cumul"
            dataKey="cumulativeReach"
            name="Reach cumulé"
            stroke="#f59e0b"
            strokeWidth={2.5}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
