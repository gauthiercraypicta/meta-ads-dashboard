'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  ReferenceLine,
} from 'recharts';
import { InsightData } from '@/types/meta';
import { processInsights } from '@/lib/metaHelpers';
import { formatCurrency, formatNumber, formatROAS } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyPoint {
  date: string;
  dateRaw: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversions: number;
  conversionValue: number;
  roas: number;
  frequency: number;
  cpa: number;
  cvr: number;
}

type KpiKey = keyof Omit<DailyPoint, 'date' | 'dateRaw'>;

interface KpiConfig {
  key: KpiKey;
  label: string;
  color: string;
  format: (v: number) => string;
}

// ─── KPI definitions ──────────────────────────────────────────────────────────

const KPI_LIST: KpiConfig[] = [
  { key: 'spend',           label: 'Dépenses',    color: '#3B82F6', format: formatCurrency },
  { key: 'impressions',     label: 'Impressions', color: '#6366F1', format: formatNumber },
  { key: 'reach',           label: 'Portée',      color: '#8B5CF6', format: formatNumber },
  { key: 'clicks',          label: 'Clics',       color: '#06B6D4', format: formatNumber },
  { key: 'ctr',             label: 'CTR',         color: '#14B8A6', format: (v) => `${v.toFixed(2)}%` },
  { key: 'cpc',             label: 'CPC',         color: '#F59E0B', format: formatCurrency },
  { key: 'cpm',             label: 'CPM',         color: '#EF4444', format: formatCurrency },
  { key: 'conversions',     label: 'Conversions', color: '#22C55E', format: formatNumber },
  { key: 'conversionValue', label: 'Val. conv.',  color: '#10B981', format: formatCurrency },
  { key: 'roas',            label: 'ROAS',        color: '#F43F5E', format: formatROAS },
  { key: 'cvr',             label: 'CVR',         color: '#A855F7', format: (v) => `${v.toFixed(2)}%` },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function yAxisFormatter(value: number, kpi: KpiConfig): string {
  const isMoney = ['spend', 'cpc', 'cpm', 'conversionValue'].includes(kpi.key);
  if (kpi.key === 'ctr' || kpi.key === 'cvr') return `${value.toFixed(1)}%`;
  if (kpi.key === 'roas') return `${value.toFixed(1)}x`;
  if (isMoney) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return `${Math.round(value)}`;
}

function spendYFormatter(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function processDailyData(raw: InsightData[]): DailyPoint[] {
  return raw
    .map((item) => {
      const m = processInsights(item);
      const cvr = m.clicks > 0 ? (m.conversions / m.clicks) * 100 : 0;
      const d = new Date(item.date_start!);
      return {
        ...m,
        cvr,
        dateRaw: item.date_start!,
        date: d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
      };
    })
    .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
  kpi: KpiConfig;
}

function CustomTooltip({ active, payload, label, kpi }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none">
      <p className="text-xs text-gray-500 mb-1 font-medium">{label}</p>
      <p className="text-base font-bold" style={{ color: kpi.color }}>
        {kpi.format(payload[0].value)}
      </p>
    </div>
  );
}

interface DualTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string }>;
  label?: string;
}

function DualAxisTooltip({ active, payload, label }: DualTooltipProps) {
  if (!active || !payload?.length) return null;
  const spendVal = payload.find((p) => p.dataKey === 'spend')?.value;
  const roasVal = payload.find((p) => p.dataKey === 'roas')?.value;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none">
      <p className="text-xs text-gray-500 mb-2 font-medium">{label}</p>
      {spendVal !== undefined && (
        <p className="text-sm font-bold text-gray-600">
          <span className="text-[10px] font-normal text-gray-400 mr-1">Dépenses</span>
          {formatCurrency(spendVal)}
        </p>
      )}
      {roasVal !== undefined && (
        <p className="text-sm font-bold text-blue-600">
          <span className="text-[10px] font-normal text-gray-400 mr-1">ROAS</span>
          {formatROAS(roasVal)}
        </p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type DatePreset = 'last_7d' | 'last_30d' | 'last_90d' | 'since_dec_1';

const PERIOD_LABELS: Record<DatePreset, string> = {
  last_7d: '7 derniers jours',
  last_30d: '30 derniers jours',
  last_90d: '90 derniers jours',
  since_dec_1: 'Depuis le 1er décembre 2025',
};

interface Props {
  refreshKey?: number;
  datePreset?: DatePreset;
  focusedKpi?: string | null;
  /** Pass pre-fetched data from Dashboard to avoid a duplicate /api/daily request */
  dailyData?: InsightData[] | null;
}

export default function DailyChart({ refreshKey = 0, datePreset = 'last_30d', focusedKpi, dailyData }: Props) {
  const [rawData, setRawData] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<KpiKey>('spend');
  const sectionRef = useRef<HTMLElement>(null);

  // Sync external focusedKpi → selectedKey + scroll into view
  useEffect(() => {
    if (!focusedKpi) return;
    const kpi = KPI_LIST.find((k) => k.key === focusedKpi);
    if (kpi) {
      setSelectedKey(kpi.key);
      setTimeout(() => {
        sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
    }
  }, [focusedKpi]);

  const fetchDaily = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setRawData(json.data ?? []);
    } catch {
      setError('Impossible de charger les données journalières.');
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => {
    // If parent supplies data, use it directly — no extra network call
    if (dailyData !== undefined) {
      setRawData(dailyData ?? []);
      setLoading(false);
      setError(null);
      return;
    }
    fetchDaily();
  }, [fetchDaily, refreshKey, dailyData]);

  const chartData = useMemo(() => processDailyData(rawData), [rawData]);

  const activeKpi = KPI_LIST.find((k) => k.key === selectedKey)!;
  const gradientId = `grad_${selectedKey}`;

  // Average ROAS for the reference line in dual-axis mode
  const avgRoas = useMemo(() => {
    if (!chartData.length) return 0;
    const valid = chartData.filter((d) => d.roas > 0);
    if (!valid.length) return 0;
    return valid.reduce((acc, d) => acc + d.roas, 0) / valid.length;
  }, [chartData]);

  // Summary stats
  const stats = useMemo(() => {
    if (!chartData.length) return null;
    const values = chartData.map((d) => d[selectedKey] as number);
    const total = values.reduce((a, b) => a + b, 0);
    const max = Math.max(...values);
    const avg = total / values.length;
    const maxDay = chartData[values.indexOf(max)];
    return { total, max, avg, maxDay };
  }, [chartData, selectedKey]);

  const isPercent = selectedKey === 'ctr' || selectedKey === 'cvr';
  const isRoas = selectedKey === 'roas';
  const isDualAxis = selectedKey === 'spend';

  const xInterval = Math.max(0, Math.floor(chartData.length / 7) - 1);

  return (
    <section ref={sectionRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-24">
      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Évolution journalière</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {PERIOD_LABELS[datePreset]} · 1 point = 1 jour
              {isDualAxis && <span className="ml-1.5 text-blue-400">· Barres = Dépenses · Ligne = ROAS</span>}
            </p>
          </div>
          {/* Mini stats */}
          {stats && !loading && (
            <div className="hidden sm:flex items-center gap-6 text-right">
              {!isPercent && !isRoas && !isDualAxis && (
                <div>
                  <p className="text-xs text-gray-400">Total</p>
                  <p className="text-sm font-bold text-gray-900">{activeKpi.format(stats.total)}</p>
                </div>
              )}
              {isDualAxis && avgRoas > 0 && (
                <div>
                  <p className="text-xs text-gray-400">ROAS moyen</p>
                  <p className="text-sm font-bold text-blue-600">{formatROAS(avgRoas)}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-gray-400">Moyenne / jour</p>
                <p className="text-sm font-bold text-gray-900">{activeKpi.format(stats.avg)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Meilleur jour</p>
                <p className="text-sm font-bold" style={{ color: isDualAxis ? '#6B7280' : activeKpi.color }}>
                  {activeKpi.format(stats.max)}
                  <span className="text-gray-400 font-normal ml-1">({stats.maxDay?.date})</span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── KPI pills ── */}
        <div className="flex flex-wrap gap-2">
          {KPI_LIST.map((kpi) => (
            <button
              key={kpi.key}
              onClick={() => setSelectedKey(kpi.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                selectedKey === kpi.key
                  ? 'text-white border-transparent shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
              style={selectedKey === kpi.key ? { backgroundColor: kpi.color, borderColor: kpi.color } : {}}
            >
              {kpi.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="px-2 py-4">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
            <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Chargement des données journalières…</p>
          </div>
        ) : error ? (
          <div className="h-64 flex items-center justify-center">
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm max-w-md">
              <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Aucune donnée disponible pour cette période.
          </div>
        ) : isDualAxis ? (
          /* ── Dual-axis: Spend (bars) + ROAS (line) ── */
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                interval={xInterval}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={spendYFormatter}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tickFormatter={(v) => `${v.toFixed(1)}x`}
                tick={{ fontSize: 11, fill: '#3B82F6' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                content={(props) => (
                  <DualAxisTooltip
                    active={props.active}
                    payload={props.payload as Array<{ value: number; dataKey: string }>}
                    label={props.label as string}
                  />
                )}
                cursor={{ stroke: '#D1D5DB', strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              {avgRoas > 0 && (
                <ReferenceLine
                  yAxisId="right"
                  y={avgRoas}
                  stroke="#3B82F6"
                  strokeDasharray="5 5"
                  strokeWidth={1.5}
                  label={{
                    value: `Moy. ROAS ${avgRoas.toFixed(2)}x`,
                    position: 'insideTopRight',
                    fill: '#3B82F6',
                    fontSize: 10,
                  }}
                />
              )}
              <Bar
                yAxisId="left"
                dataKey="spend"
                fill="#D1D5DB"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
              <Line
                yAxisId="right"
                dataKey="roas"
                stroke="#3B82F6"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#3B82F6', strokeWidth: 0 }}
                type="monotone"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          /* ── Single KPI area chart ── */
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={activeKpi.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={activeKpi.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                interval={xInterval}
              />
              <YAxis
                tickFormatter={(v) => yAxisFormatter(v, activeKpi)}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={58}
              />
              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={props.payload as Array<{ value: number }>}
                    label={props.label as string}
                    kpi={activeKpi}
                  />
                )}
                cursor={{ stroke: activeKpi.color, strokeWidth: 1, strokeDasharray: '4 4' }}
              />
              <Area
                type="monotone"
                dataKey={selectedKey}
                stroke={activeKpi.color}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 5, fill: activeKpi.color, strokeWidth: 0 }}
                isAnimationActive={true}
                animationDuration={400}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
