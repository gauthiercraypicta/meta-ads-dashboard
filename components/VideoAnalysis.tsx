'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { AdData, AdInsight, AdInsightAction } from '@/types/creative';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  refreshKey?: number;
  datePreset?: 'last_7d' | 'last_30d' | 'last_90d';
}

interface VideoRow {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  hookRate: number;       // 3s video views / impressions × 100
  holdRate: number;       // thruplay or video_view / impressions × 100
  ctr: number;
  cpm: number;
  roas: number;
  spend: number;
  impressions: number;
  signal: string;
}

type SortKey = keyof Pick<VideoRow, 'name' | 'hookRate' | 'holdRate' | 'ctr' | 'cpm' | 'roas' | 'spend'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getActionValue(actions: AdInsightAction[] | undefined, actionType: string): number {
  if (!actions) return 0;
  const entry = actions.find((a) => a.action_type === actionType);
  return entry ? parseFloat(entry.value) || 0 : 0;
}

function isVideoAd(ad: AdData): boolean {
  if (ad.creative?.video_id) return true;
  if (ad.creative?.object_type?.toUpperCase().includes('VIDEO')) return true;
  return false;
}

function computeSignal(row: { hookRate: number; holdRate: number; roas: number; spend: number }): string {
  if (row.spend < 10) return 'NEW';
  if (row.hookRate >= 30 && row.roas >= 2) return 'SCALE';
  if (row.hookRate >= 20 && row.roas >= 1.5) return 'WATCH';
  if (row.hookRate < 15 || row.roas < 1) return 'CUT';
  return 'FATIGUE';
}

function signalBadgeClass(signal: string): string {
  switch (signal) {
    case 'SCALE':   return 'bg-green-100 text-green-700';
    case 'WATCH':   return 'bg-yellow-100 text-yellow-700';
    case 'FATIGUE': return 'bg-orange-100 text-orange-700';
    case 'CUT':     return 'bg-red-100 text-red-700';
    case 'NEW':     return 'bg-blue-100 text-blue-700';
    default:        return 'bg-gray-100 text-gray-700';
  }
}

function hookRateClass(rate: number): string {
  if (rate >= 30) return 'text-green-600 font-semibold';
  if (rate >= 20) return 'text-yellow-600 font-semibold';
  return 'text-red-600 font-semibold';
}

function holdRateClass(rate: number): string {
  if (rate >= 15) return 'text-green-600 font-semibold';
  if (rate >= 8) return 'text-yellow-600 font-semibold';
  return 'text-red-600 font-semibold';
}

function parseVideoRows(ads: AdData[]): VideoRow[] {
  const videoAds = ads.filter(isVideoAd);

  return videoAds.map((ad) => {
    const insight: AdInsight = ad.insights?.data?.[0] ?? {};
    const impressions = parseFloat(insight.impressions ?? '0') || 0;
    const spend       = parseFloat(insight.spend ?? '0') || 0;
    const clicks      = parseFloat(insight.clicks ?? '0') || 0;
    const ctr         = parseFloat(insight.ctr ?? '0') || 0;
    const cpm         = parseFloat(insight.cpm ?? '0') || 0;

    const videoViews3s = getActionValue(insight.actions, 'video_view');
    const thruplay     = getActionValue(insight.actions, 'video_thruplay_watched');

    const roas = insight.purchase_roas?.[0]
      ? parseFloat(insight.purchase_roas[0].value) || 0
      : 0;

    const hookRate = impressions > 0 ? (videoViews3s / impressions) * 100 : 0;
    const holdRate = impressions > 0
      ? (thruplay > 0 ? (thruplay / impressions) * 100 : (videoViews3s / impressions) * 100)
      : 0;

    const partial: Omit<VideoRow, 'signal'> = {
      id: ad.id,
      name: ad.name,
      thumbnailUrl: ad.creative?.thumbnail_url ?? null,
      hookRate,
      holdRate,
      ctr,
      cpm,
      roas,
      spend,
      impressions,
    };

    return {
      ...partial,
      signal: computeSignal(partial),
    };
  });
}

// ─── Scatter tooltip ──────────────────────────────────────────────────────────

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: VideoRow }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1 max-w-[220px]">
      <p className="font-semibold text-gray-800 truncate">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
        <span>Hook Rate</span>  <span className="font-mono text-right">{d.hookRate.toFixed(1)}%</span>
        <span>ROAS</span>       <span className="font-mono text-right">{d.roas.toFixed(2)}x</span>
        <span>Spend</span>      <span className="font-mono text-right">${d.spend.toLocaleString()}</span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoAnalysis({ refreshKey, datePreset = 'last_30d' }: Props) {
  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchAds = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ads?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) {
        setError(json.error);
        return;
      }
      setAds(json.data ?? []);
    } catch {
      setError('Failed to fetch video ads data');
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => {
    fetchAds();
  }, [fetchAds, refreshKey]);

  const rows = useMemo(() => parseVideoRows(ads), [ads]);

  // ── Macro KPIs ────────────────────────────────────────────────────────────

  const avgHookRate = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((s, r) => s + r.hookRate, 0) / rows.length;
  }, [rows]);

  const avgHoldRate = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((s, r) => s + r.holdRate, 0) / rows.length;
  }, [rows]);

  const bestPerformer = useMemo(() => {
    if (!rows.length) return '—';
    const best = rows.reduce((a, b) => (b.hookRate > a.hookRate ? b : a));
    return best.name.length > 30 ? best.name.slice(0, 29) + '...' : best.name;
  }, [rows]);

  // ── Sorted rows ───────────────────────────────────────────────────────────

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const diff = (av as number) - (bv as number);
      return sortDir === 'asc' ? diff : -diff;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  // ── Scatter data ──────────────────────────────────────────────────────────

  const scatterRows = useMemo(() => rows.filter((r) => r.spend > 0), [rows]);
  const maxSpend = useMemo(() => Math.max(1, ...scatterRows.map((r) => r.spend)), [scatterRows]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm animate-pulse">
          Loading video analysis...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-48 flex items-center justify-center text-red-500 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
          No video ads found for this period.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Video Performance Analysis</h2>
        <p className="text-xs text-gray-500 mt-0.5">Hook &amp; hold metrics computed from 3-second video views</p>
      </div>

      {/* ── Macro KPIs ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Avg Hook Rate" value={`${avgHookRate.toFixed(1)}%`} sub="3s views / impressions" />
        <KpiCard label="Avg Hold Rate" value={`${avgHoldRate.toFixed(1)}%`} sub="ThruPlay / impressions" />
        <KpiCard label="Best Performer" value={bestPerformer} sub="Highest hook rate" small />
        <KpiCard label="Videos Active" value={String(rows.length)} sub="With spend > $0" />
      </div>

      {/* ── Video Performance Table ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Video Performance Table</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2 text-left font-medium">Thumb</th>
                <th className="px-4 py-2 text-left font-medium cursor-pointer select-none" onClick={() => handleSort('name')}>
                  Name{sortIndicator('name')}
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('hookRate')}>
                  Hook Rate{sortIndicator('hookRate')}
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('holdRate')}>
                  Hold Rate{sortIndicator('holdRate')}
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('ctr')}>
                  CTR{sortIndicator('ctr')}
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('cpm')}>
                  CPM{sortIndicator('cpm')}
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('roas')}>
                  ROAS{sortIndicator('roas')}
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('spend')}>
                  Spend{sortIndicator('spend')}
                </th>
                <th className="px-4 py-2 text-center font-medium">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2">
                    {row.thumbnailUrl ? (
                      <img
                        src={row.thumbnailUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-gray-800 max-w-[200px] truncate" title={row.name}>
                    {row.name}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${hookRateClass(row.hookRate)}`}>
                    {row.hookRate.toFixed(1)}%
                  </td>
                  <td className={`px-4 py-2 text-right font-mono ${holdRateClass(row.holdRate)}`}>
                    {row.holdRate.toFixed(1)}%
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    {row.ctr.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    ${row.cpm.toFixed(2)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    {row.roas.toFixed(2)}x
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-gray-700">
                    ${row.spend.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${signalBadgeClass(row.signal)}`}>
                      {row.signal}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Scatter Plot: Hook Rate vs ROAS ────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Hook Rate vs ROAS</h3>
          <p className="text-xs text-gray-500 mt-0.5">Dot size = spend</p>
        </div>
        {scatterRows.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                type="number"
                dataKey="hookRate"
                domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                label={{ value: 'Hook Rate (%)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="roas"
                domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v.toFixed(1)}x`}
                tick={{ fontSize: 11, fill: '#6b7280' }}
                label={{ value: 'ROAS', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
              />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={scatterRows}>
                {scatterRows.map((entry) => {
                  const r = Math.max(6, Math.min(30, Math.sqrt(entry.spend / maxSpend) * 30));
                  const color = entry.hookRate >= 30
                    ? 'hsl(120,70%,45%)'
                    : entry.hookRate >= 20
                      ? 'hsl(45,90%,50%)'
                      : 'hsl(0,75%,50%)';
                  return (
                    <Cell
                      key={entry.id}
                      fill={color}
                      fillOpacity={0.7}
                      r={r}
                    />
                  );
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            No data for scatter plot
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, small }: { label: string; value: string; sub: string; small?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-semibold text-gray-900 ${small ? 'text-sm truncate' : 'text-xl'}`} title={value}>
        {value}
      </p>
      <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
