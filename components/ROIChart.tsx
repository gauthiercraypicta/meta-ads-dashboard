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

// ─── Constants ─────────────────────────────────────────────────────────────────
const MARGIN_RATE = 0.453;

const PURCHASE_PRIORITY = [
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AttrField = 'value' | '7d_click' | '1d_view';

function pickValue(actions: ActionData[] | undefined, field: AttrField): number {
  if (!actions) return 0;
  for (const type of PURCHASE_PRIORITY) {
    const match = actions.find((a) => a.action_type === type);
    if (match) {
      // For 'value' use the default field; for window-specific fields, don't fall back
      if (field === 'value') return parseFloat(match.value ?? '0');
      return parseFloat(match[field] ?? '0');
    }
  }
  return 0;
}


function computeROI(convValue: number, spend: number): number | null {
  if (spend <= 0 || convValue <= 0) return null;
  return (convValue * MARGIN_RATE) / spend;
}

function formatROILabel(v: number): string {
  return `${(v * 100).toFixed(0)}%`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ROIPoint {
  date: string;
  dateRaw: string;
  roiAll: number | null;
  roiFirst7d: number | null;
  roiFirstAll: number | null;
  spend: number;
}

type DatePreset = 'last_7d' | 'last_30d' | 'last_90d';

const PERIOD_LABELS: Record<DatePreset, string> = {
  last_7d: '7 derniers jours',
  last_30d: '30 derniers jours',
  last_90d: '90 derniers jours',
};

// ROI line definitions — 3 distinct attribution windows
const ROI_LINES = [
  { key: 'roiAll',      label: 'Toutes conv. (7j+1j)',   color: '#3B82F6', dash: ''     },
  { key: 'roiFirst7d',  label: 'Clic seul (7j)',          color: '#F59E0B', dash: ''     },
  { key: 'roiFirstAll', label: 'Vue seule (1j)',           color: '#10B981', dash: '5 3' },
] as const;

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; dataKey: string }>;
  label?: string;
}

function ROITooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none min-w-[200px]">
      <p className="text-xs text-gray-500 mb-2 font-medium">{label}</p>
      {ROI_LINES.map(({ key, label: lineLabel, color }) => {
        const entry = payload.find((p) => p.dataKey === key);
        if (!entry || entry.value == null) return null;
        return (
          <div key={key} className="flex items-center justify-between gap-4 mb-1">
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              {lineLabel}
            </span>
            <span className="text-xs font-bold" style={{ color }}>
              {formatROILabel(entry.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  refreshKey?: number;
  datePreset?: DatePreset;
}

export default function ROIChart({ refreshKey = 0, datePreset = 'last_30d' }: Props) {
  const [rawData, setRawData] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hiddenLines, setHiddenLines] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/daily?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setRawData(json.data ?? []);
    } catch {
      setError('Impossible de charger les données ROI.');
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => { fetchData(); }, [fetchData, refreshKey]);

  // Process raw data into ROI points
  const chartData = useMemo((): ROIPoint[] => {
    return rawData
      .map((item): ROIPoint => {
        const spend = parseFloat(item.spend || '0');
        const d = new Date(item.date_start!);
        const date = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

        // 1. Toutes conv. — 7d_click + 1d_view combined (Meta default)
        const convAll = pickValue(item.action_values, 'value');

        // 2. Clic seul (7j) — only click-attributed conversions
        const convFirst7d = pickValue(item.action_values, '7d_click');

        // 3. Vue seule (1j) — only view-through attributed conversions
        const convFirstAll = pickValue(item.action_values, '1d_view');

        return {
          date,
          dateRaw: item.date_start!,
          roiAll:      computeROI(convAll,       spend),
          roiFirst7d:  computeROI(convFirst7d,   spend),
          roiFirstAll: computeROI(convFirstAll,  spend),
          spend,
        };
      })
      .sort((a, b) => a.dateRaw.localeCompare(b.dateRaw));
  }, [rawData]);

  // Average ROI per line (for reference lines)
  const avgROI = useMemo(() => {
    if (!chartData.length) return {};
    const result: Record<string, number> = {};
    for (const { key } of ROI_LINES) {
      const valid = chartData.filter((d) => d[key] != null) as ROIPoint[];
      if (valid.length) {
        result[key] = valid.reduce((acc, d) => acc + (d[key] as number), 0) / valid.length;
      }
    }
    return result;
  }, [chartData]);

  const toggleLine = (key: string) => {
    setHiddenLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const xInterval = Math.max(0, Math.floor(chartData.length / 7) - 1);

  // Breakeven reference (ROI = 100% = value 1.0)
  const breakevenROI = 1.0;

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">ROI journalier</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {PERIOD_LABELS[datePreset]} · (CA × {(MARGIN_RATE * 100).toFixed(1)}%) / Dépenses · Bleu = 7j clic + 1j vue · Jaune = clic seul · Vert = vue seule
            </p>
          </div>

          {/* Average badges */}
          {!loading && (
            <div className="hidden sm:flex items-center gap-4">
              {ROI_LINES.map(({ key, label, color }) => {
                const avg = avgROI[key];
                if (avg == null) return null;
                return (
                  <div key={key} className="text-right">
                    <p className="text-xs text-gray-400">Moy. {label}</p>
                    <p className="text-sm font-bold" style={{ color }}>
                      {formatROILabel(avg)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend toggles */}
        <div className="flex flex-wrap gap-2">
          {ROI_LINES.map(({ key, label, color, dash }) => {
            const hidden = hiddenLines.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleLine(key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  hidden
                    ? 'bg-white text-gray-400 border-gray-200 opacity-50'
                    : 'text-white border-transparent shadow-sm'
                }`}
                style={!hidden ? { backgroundColor: color, borderColor: color } : {}}
              >
                {/* Line preview */}
                <svg width="20" height="10" className="shrink-0">
                  <line
                    x1="0" y1="5" x2="20" y2="5"
                    stroke={hidden ? '#9CA3AF' : 'white'}
                    strokeWidth="2"
                    strokeDasharray={dash}
                  />
                </svg>
                {label}
              </button>
            );
          })}
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
            <p className="text-sm">Chargement des données ROI…</p>
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
        ) : (
          <ResponsiveContainer width="100%" height={300}>
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
                tickFormatter={(v) => formatROILabel(v)}
                tick={{ fontSize: 11, fill: '#9CA3AF' }}
                axisLine={false}
                tickLine={false}
                width={52}
                domain={['auto', 'auto']}
              />
              <Tooltip
                content={(props) => (
                  <ROITooltip
                    active={props.active}
                    payload={props.payload as Array<{ name: string; value: number; color: string; dataKey: string }>}
                    label={props.label as string}
                  />
                )}
                cursor={{ stroke: '#D1D5DB', strokeWidth: 1, strokeDasharray: '4 4' }}
              />

              {/* Breakeven line at 100% */}
              <ReferenceLine
                y={breakevenROI}
                stroke="#EF4444"
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{
                  value: 'Seuil rentabilité (100%)',
                  position: 'insideTopRight',
                  fill: '#EF4444',
                  fontSize: 10,
                }}
              />

              {ROI_LINES.map(({ key, color, dash }) =>
                hiddenLines.has(key) ? null : (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={2.5}
                    strokeDasharray={dash}
                    dot={false}
                    activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
                    connectNulls={true}
                  />
                )
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
