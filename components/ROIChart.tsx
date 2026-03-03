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
function getConvValue(
  actionValues: ActionData[] | undefined,
  field: 'value' | '7d_click' | '1d_view',
): number {
  if (!actionValues) return 0;
  for (const type of PURCHASE_TYPES) {
    const entry = actionValues.find((a) => a.action_type === type);
    if (entry) {
      if (field === 'value') return parseFloat(entry.value ?? '0');
      return parseFloat(entry[field] ?? '0');
    }
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
type LineKey = 'roiTotal' | 'roiClick7d' | 'roiView1d';

const LINES: Array<{ key: LineKey; label: string; color: string; dash: string }> = [
  { key: 'roiTotal',   label: 'Toutes conv. (7j clic + 1j vue)', color: '#3B82F6', dash: ''    },
  { key: 'roiClick7d', label: 'Attribution clic seul (7j)',       color: '#F59E0B', dash: ''    },
  { key: 'roiView1d',  label: 'Attribution vue seule (1j)',        color: '#10B981', dash: '5 3' },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ChartPoint {
  date: string;
  dateRaw: string;
  roiTotal: number | null;
  roiClick7d: number | null;
  roiView1d: number | null;
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
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 min-w-[220px] pointer-events-none">
      <p className="text-xs text-gray-500 font-medium mb-2">{label}</p>
      {LINES.map(({ key, label: lbl, color }) => {
        const item = payload.find((p) => p.dataKey === key);
        if (!item || item.value == null) return null;
        return (
          <div key={key} className="flex items-center justify-between gap-4 mb-1">
            <span className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {lbl}
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color }}>
              {pct(item.value)}
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
  const [rawData, setRawData]   = useState<InsightData[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [hidden, setHidden]     = useState<Set<LineKey>>(new Set());

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

  useEffect(() => { load(); }, [load, refreshKey]);

  // Build chart data from raw API response
  const chartData = useMemo((): ChartPoint[] =>
    rawData
      .map((item): ChartPoint => {
        const spend = parseFloat(item.spend ?? '0');
        const date  = new Date(item.date_start!).toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'short',
        });
        return {
          date,
          dateRaw:    item.date_start!,
          roiTotal:   toROI(getConvValue(item.action_values, 'value'),    spend),
          roiClick7d: toROI(getConvValue(item.action_values, '7d_click'), spend),
          roiView1d:  toROI(getConvValue(item.action_values, '1d_view'),  spend),
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

          {/* Average ROI badges */}
          {!loading && Object.keys(averages).length > 0 && (
            <div className="hidden sm:flex items-center gap-5 shrink-0">
              {LINES.map(({ key, label, color }) => {
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

        {/* Toggle buttons */}
        <div className="flex flex-wrap gap-2">
          {LINES.map(({ key, label, color, dash }) => {
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
                content={<CustomTooltip />}
                cursor={{ stroke: '#E5E7EB', strokeWidth: 1, strokeDasharray: '4 4' }}
              />

              {/* Breakeven at 100% */}
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

              {LINES.map(({ key, color, dash }) =>
                hidden.has(key) ? null : (
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
                ),
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
