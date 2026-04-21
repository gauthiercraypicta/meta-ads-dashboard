'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { formatNumber } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawPoint {
  adId: string;
  adName: string;
  date: string;
  impressions: number;
  spend: number;
}

type DatePreset = 'last_7d' | 'last_30d' | 'last_90d' | 'since_dec_1';

const PALETTE = [
  '#6366F1', '#3B82F6', '#06B6D4', '#22C55E', '#F59E0B',
  '#EF4444', '#8B5CF6', '#F43F5E', '#14B8A6', '#D946EF',
  '#EC4899', '#84CC16', '#0EA5E9', '#FB923C', '#A855F7',
];

// ─── Custom tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  adNameMap: Map<string, string>;
}

function ImprTooltip({ active, payload, label, adNameMap }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const dateLabel = new Date(label + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const sorted = [...payload].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, e) => s + e.value, 0);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none max-w-xs">
      <p className="text-xs text-gray-500 font-medium mb-2">{dateLabel} · Total : {formatNumber(total)}</p>
      {sorted.map((entry) => {
        const name = adNameMap.get(entry.dataKey) ?? entry.dataKey;
        const truncName = name.length > 30 ? name.slice(0, 27) + '…' : name;
        return (
          <div key={entry.dataKey} className="flex items-center gap-2 text-xs mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-700 truncate">{truncName}</span>
            <span className="ml-auto font-mono font-bold" style={{ color: entry.color }}>
              {formatNumber(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  datePreset?: DatePreset;
}

export default function ImpressionsChart({ datePreset = 'last_30d' }: Props) {
  const [rawData, setRawData] = useState<RawPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creative-decay?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRawData(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => { load(); }, [load]);

  // Top ads by total impressions (limit 10)
  const topAdIds = useMemo(() => {
    const byAd = new Map<string, number>();
    for (const p of rawData) {
      byAd.set(p.adId, (byAd.get(p.adId) ?? 0) + p.impressions);
    }
    return [...byAd.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
  }, [rawData]);

  const adNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rawData) map.set(p.adId, p.adName);
    return map;
  }, [rawData]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    topAdIds.forEach((id, i) => map.set(id, PALETTE[i % PALETTE.length]));
    return map;
  }, [topAdIds]);

  // Build chart: { date, [adId]: impressions, ... }
  const chartData = useMemo(() => {
    const dateSet = new Set<string>();
    for (const p of rawData) {
      if (topAdIds.includes(p.adId)) dateSet.add(p.date);
    }
    const dates = [...dateSet].sort();

    return dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const adId of topAdIds) {
        const point = rawData.find((p) => p.adId === adId && p.date === date);
        row[adId] = point?.impressions ?? 0;
      }
      return row;
    });
  }, [rawData, topAdIds]);

  // Totals summary
  const totalImpressions = useMemo(() => rawData.reduce((s, p) => s + p.impressions, 0), [rawData]);
  const avgDaily = useMemo(() => {
    const dates = new Set(rawData.map((p) => p.date));
    return dates.size > 0 ? totalImpressions / dates.size : 0;
  }, [rawData, totalImpressions]);

  const visibleAdIds = topAdIds.filter((id) => !hidden.has(id));

  const toggleHidden = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const xInterval = Math.max(0, Math.floor(chartData.length / 7) - 1);
  const formatDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Impressions totales</p>
          <p className="text-xl font-bold text-gray-900">{formatNumber(totalImpressions)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Moyenne / jour</p>
          <p className="text-xl font-bold text-gray-900">{formatNumber(Math.round(avgDaily))}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Créas actives</p>
          <p className="text-xl font-bold text-gray-900">{topAdIds.length}</p>
        </div>
      </div>

      {/* Chart */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Impressions par créative</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Top 10 par volume · 1 point = 1 jour
                {error && <span className="ml-2 text-red-400">{error}</span>}
              </p>
            </div>
            {!loading && (
              <div className="text-right">
                <p className="text-xs text-gray-400">Total période</p>
                <p className="text-sm font-bold text-gray-900">{formatNumber(totalImpressions)}</p>
              </div>
            )}
          </div>
        </div>

        <div className="px-2 py-4">
          {loading ? (
            <div className="h-72 flex flex-col items-center justify-center gap-3 text-gray-400">
              <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm">Chargement…</p>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-72 flex items-center justify-center text-gray-400 text-sm">
              Aucune donnée disponible pour cette période.
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={360}>
                <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <defs>
                    {visibleAdIds.map((adId) => (
                      <linearGradient key={`grad-${adId}`} id={`grad-${adId}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={colorMap.get(adId)} stopOpacity={0.15} />
                        <stop offset="100%" stopColor={colorMap.get(adId)} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 11, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                    interval={xInterval}
                  />
                  <YAxis
                    tickFormatter={(v) => {
                      if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                      if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                      return `${v}`;
                    }}
                    tick={{ fontSize: 11, fill: '#9CA3AF' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    content={(props) => (
                      <ImprTooltip
                        active={props.active}
                        payload={props.payload as TooltipProps['payload']}
                        label={props.label as string}
                        adNameMap={adNameMap}
                      />
                    )}
                    cursor={{ stroke: '#D1D5DB', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  {visibleAdIds.map((adId, i) => (
                    <Area
                      key={adId}
                      type="monotone"
                      dataKey={adId}
                      stroke={colorMap.get(adId)}
                      strokeWidth={2}
                      fill={`url(#grad-${adId})`}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      stackId="impressions"
                      connectNulls
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>

              {/* Interactive legend */}
              <div className="flex flex-wrap gap-2 mt-3 px-4">
                {topAdIds.map((id) => {
                  const isHidden = hidden.has(id);
                  const name = adNameMap.get(id) ?? id;
                  const truncName = name.length > 25 ? name.slice(0, 22) + '…' : name;
                  return (
                    <button
                      key={id}
                      onClick={() => toggleHidden(id)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-medium transition-all border ${
                        isHidden
                          ? 'bg-gray-50 text-gray-400 border-gray-200'
                          : 'bg-white text-gray-700 border-gray-300 shadow-sm'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: isHidden ? '#D1D5DB' : colorMap.get(id) }}
                      />
                      {truncName}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
