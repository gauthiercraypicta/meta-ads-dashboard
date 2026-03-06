'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { InsightData, ActionData } from '@/types/meta';

// ─── Constants ────────────────────────────────────────────────────────────────
const MARGIN_RATE = 0.453;
const PURCHASE_TYPES = [
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
type ConvField = keyof Pick<
  ActionData,
  'value' | '7d_click' | '1d_view' | '7d_click_first_conversion' | '1d_view_first_conversion'
>;

function getConvValue(
  actionValues: ActionData[] | undefined,
  field: ConvField,
): number {
  if (!actionValues) return 0;
  for (const type of PURCHASE_TYPES) {
    const entry = actionValues.find((a) => a.action_type === type);
    if (entry) return parseFloat(entry[field] ?? '0');
  }
  return 0;
}

function toROI(conv: number, spend: number): number | null {
  if (spend <= 0 || conv <= 0) return null;
  return (conv * MARGIN_RATE) / spend;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

// ─── Chart config ─────────────────────────────────────────────────────────────
type LineKey =
  | 'roiTotal'
  | 'roiClick7d'
  | 'roiView1d'
  | 'roiFirstTotal'
  | 'roiFirstClick7d'
  | 'roiFirstView1d';

interface LineConfig {
  key:   LineKey;
  label: string;
  color: string;
  dash:  string;
  group: 'all' | 'first';
}

const LINES: LineConfig[] = [
  { key: 'roiTotal',        label: 'Toutes conv. (7j clic + 1j vue)',  color: '#3B82F6', dash: '',    group: 'all'   },
  { key: 'roiClick7d',      label: 'Attribution clic seul (7j)',        color: '#F59E0B', dash: '',    group: 'all'   },
  { key: 'roiView1d',       label: 'Attribution vue seule (1j)',         color: '#10B981', dash: '5 3', group: 'all'   },
  { key: 'roiFirstTotal',   label: 'First conv. (7j clic + 1j vue)',    color: '#8B5CF6', dash: '',    group: 'first' },
  { key: 'roiFirstClick7d', label: 'First conv. clic seul (7j)',        color: '#EC4899', dash: '',    group: 'first' },
  { key: 'roiFirstView1d',  label: 'First conv. vue seule (1j)',         color: '#06B6D4', dash: '5 3', group: 'first' },
];

const LINES_ALL   = LINES.filter((l) => l.group === 'all');
const LINES_FIRST = LINES.filter((l) => l.group === 'first');

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChartPoint {
  date:            string;
  dateRaw:         string;
  roiTotal:        number | null;
  roiClick7d:      number | null;
  roiView1d:       number | null;
  roiFirstTotal:   number | null;
  roiFirstClick7d: number | null;
  roiFirstView1d:  number | null;
}

type DatePreset = 'last_7d' | 'last_30d' | 'last_90d';

const PERIOD_LABELS: Record<DatePreset, string> = {
  last_7d:  '7 derniers jours',
  last_30d: '30 derniers jours',
  last_90d: '90 derniers jours',
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomTooltip({
  active,
  payload,
  label,
  showFirstConv,
  hidden,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  showFirstConv: boolean;
  hidden: Set<LineKey>;
}) {
  if (!active || !payload?.length) return null;

  const getVal = (key: LineKey) => payload.find((p) => p.dataKey === key)?.value;

  const visibleAll   = LINES_ALL.filter((l) => !hidden.has(l.key));
  const visibleFirst = LINES_FIRST.filter((l) => !hidden.has(l.key));

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 min-w-[240px] pointer-events-none">
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>

      {/* ── All conv block ── */}
      {visibleAll.length > 0 && (
        <div className={showFirstConv && visibleFirst.length > 0 ? 'mb-2 pb-2 border-b border-gray-100' : ''}>
          {showFirstConv && (
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">All conv.</p>
          )}
          {visibleAll.map(({ key, label: lbl, color }) => {
            const val = getVal(key);
            if (val == null) return null;
            return (
              <div key={key} className="flex items-center justify-between gap-4 mb-0.5">
                <span className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {lbl}
                </span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct(val)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── First conv block ── */}
      {showFirstConv && visibleFirst.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">First conv.</p>
          {visibleFirst.map(({ key, label: lbl, color }) => {
            const val = getVal(key);
            if (val == null) return null;
            return (
              <div key={key} className="flex items-center justify-between gap-4 mb-0.5">
                <span className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                  {lbl}
                </span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct(val)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  refreshKey?: number;
  datePreset?: DatePreset;
  /** Pass pre-fetched data from Dashboard to avoid a duplicate /api/daily request */
  dailyData?: InsightData[] | null;
}

export default function ROIChart({ refreshKey = 0, datePreset = 'last_30d', dailyData }: Props) {
  const [rawData, setRawData]               = useState<InsightData[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [hidden, setHidden]                 = useState<Set<LineKey>>(new Set());
  const [showFirstConv, setShowFirstConv]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/daily?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRawData(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
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
    load();
  }, [load, refreshKey, dailyData]);

  // Build chart data from raw API response
  const chartData = useMemo((): ChartPoint[] =>
    rawData
      .map((item): ChartPoint => {
        const spend = parseFloat(item.spend ?? '0');
        const av    = item.action_values;
        const date  = new Date(item.date_start!).toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'short',
        });

        const fc7d = getConvValue(av, '7d_click_first_conversion');
        const fc1d = getConvValue(av, '1d_view_first_conversion');

        return {
          date,
          dateRaw:         item.date_start!,
          roiTotal:        toROI(getConvValue(av, 'value'),    spend),
          roiClick7d:      toROI(getConvValue(av, '7d_click'), spend),
          roiView1d:       toROI(getConvValue(av, '1d_view'),  spend),
          roiFirstTotal:   toROI(fc7d + fc1d,                  spend),
          roiFirstClick7d: toROI(fc7d,                         spend),
          roiFirstView1d:  toROI(fc1d,                         spend),
        };
      })
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw)),
  [rawData]);

  // Average per line (shown in header badges)
  const averages = useMemo(() => {
    const out: Partial<Record<LineKey, number>> = {};
    for (const { key } of LINES) {
      const vals = chartData
        .map((d) => d[key])
        .filter((v): v is number => v !== null);
      if (vals.length) out[key] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    return out;
  }, [chartData]);

  const toggle = (key: LineKey) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const xInterval = Math.max(0, Math.floor(chartData.length / 7) - 1);

  // Lines to render: exclude first conv when toggle is off, exclude hidden ones
  const visibleLines = LINES.filter((l) => {
    if (l.group === 'first' && !showFirstConv) return false;
    return !hidden.has(l.key);
  });

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">ROI journalier</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {PERIOD_LABELS[datePreset]} · (CA × {(MARGIN_RATE * 100).toFixed(1)}%) / Dépenses pub · Seuil à 100%
            </p>
          </div>

          {/* Average ROI badges — 2 rows when first conv is active */}
          {!loading && Object.keys(averages).length > 0 && (
            <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
              {/* Row 1: all conv averages */}
              <div className="flex items-center gap-5">
                {LINES_ALL.map(({ key, label, color }) => {
                  const avg = averages[key];
                  if (avg == null) return null;
                  return (
                    <div key={key} className="text-right">
                      <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
                      <p className="text-sm font-bold leading-tight mt-0.5" style={{ color }}>
                        {pct(avg)}
                      </p>
                    </div>
                  );
                })}
              </div>
              {/* Row 2: first conv averages (only when toggle on) */}
              {showFirstConv && (
                <div className="flex items-center gap-5">
                  {LINES_FIRST.map(({ key, label, color }) => {
                    const avg = averages[key];
                    if (avg == null) return null;
                    return (
                      <div key={key} className="text-right">
                        <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
                        <p className="text-sm font-bold leading-tight mt-0.5" style={{ color }}>
                          {pct(avg)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Legend / toggle pills ── */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Master toggle: "First Conv." */}
          <button
            onClick={() => setShowFirstConv((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              showFirstConv
                ? 'bg-violet-600 text-white border-transparent shadow-sm'
                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            First Conv.
          </button>

          <div className="w-px h-5 bg-gray-200" />

          {/* All conv individual toggles */}
          {LINES_ALL.map(({ key, label, color, dash }) => {
            const isHidden = hidden.has(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  isHidden
                    ? 'bg-white text-gray-400 border-gray-200 opacity-50'
                    : 'text-white border-transparent shadow-sm'
                }`}
                style={!isHidden ? { backgroundColor: color } : {}}
              >
                <svg width="18" height="8" className="shrink-0">
                  <line
                    x1="0" y1="4" x2="18" y2="4"
                    stroke={isHidden ? '#9CA3AF' : 'white'}
                    strokeWidth="2"
                    strokeDasharray={dash || undefined}
                  />
                </svg>
                {label}
              </button>
            );
          })}

          {/* First conv individual toggles (visible only when toggle is on) */}
          {showFirstConv && (
            <>
              <div className="w-px h-5 bg-gray-200" />
              {LINES_FIRST.map(({ key, label, color, dash }) => {
                const isHidden = hidden.has(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      isHidden
                        ? 'bg-white text-gray-400 border-gray-200 opacity-50'
                        : 'text-white border-transparent shadow-sm'
                    }`}
                    style={!isHidden ? { backgroundColor: color } : {}}
                  >
                    <svg width="18" height="8" className="shrink-0">
                      <line
                        x1="0" y1="4" x2="18" y2="4"
                        stroke={isHidden ? '#9CA3AF' : 'white'}
                        strokeWidth="2"
                        strokeDasharray={dash || undefined}
                      />
                    </svg>
                    {label}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Chart ── */}
      <div className="px-2 py-4">
        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center gap-3 text-gray-400">
            <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm">Chargement…</p>
          </div>
        ) : error ? (
          <div className="h-64 flex items-center justify-center px-4">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 max-w-sm">
              {error}
            </p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Aucune donnée pour cette période.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                interval={xInterval}
              />
              <YAxis
                tickFormatter={pct}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={52}
                domain={[0, 'auto']}
              />
              <Tooltip
                content={(props) => (
                  <CustomTooltip
                    active={props.active}
                    payload={props.payload as Array<{ dataKey: string; value: number; color: string }>}
                    label={props.label as string}
                    showFirstConv={showFirstConv}
                    hidden={hidden}
                  />
                )}
                cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '4 4' }}
              />

              {/* ⚠️ Breakeven line — do not touch */}
              <ReferenceLine
                y={1}
                stroke="#EF4444"
                strokeDasharray="5 3"
                strokeWidth={1.5}
                label={{
                  value: 'Seuil rentabilité (100%)',
                  position: 'insideTopRight',
                  fill: '#EF4444',
                  fontSize: 10,
                }}
              />

              {visibleLines.map(({ key, color, dash }) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2}
                  strokeDasharray={dash || undefined}
                  dot={false}
                  activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
