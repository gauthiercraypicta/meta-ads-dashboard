'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceDot, Legend,
} from 'recharts';
import { formatCurrency } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawPoint {
  adId: string;
  adName: string;
  date: string;
  ctr: number;
  cpa: number;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
}

type Metric = 'ctr' | 'cpa';
type Window = 14 | 21 | 30;
type DatePreset = 'last_7d' | 'last_30d' | 'last_90d' | 'since_dec_1';

interface KneeInfo {
  adId: string;
  adName: string;
  date: string;
  peakValue: number;
  kneeValue: number;
  daysBeforeDecline: number;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const PALETTE = [
  '#3B82F6', '#EF4444', '#22C55E', '#F59E0B', '#8B5CF6',
  '#06B6D4', '#F43F5E', '#14B8A6', '#D946EF', '#6366F1',
  '#EC4899', '#84CC16', '#0EA5E9', '#FB923C', '#A855F7',
];

// ─── Mock data for offline dev ────────────────────────────────────────────────

function generateMockData(): RawPoint[] {
  const ads = [
    { id: 'mock_1', name: 'Video_BrandAwareness_V1' },
    { id: 'mock_2', name: 'Static_Promo_Summer' },
    { id: 'mock_3', name: 'Carousel_NewCollection' },
  ];
  const points: RawPoint[] = [];
  const today = new Date();

  for (const ad of ads) {
    const baseCtr = 1.5 + Math.random() * 2;
    const baseCpa = 15 + Math.random() * 20;
    for (let d = 29; d >= 0; d--) {
      const dt = new Date(today);
      dt.setDate(today.getDate() - d);
      const decay = d < 15 ? 1 : 1 - ((30 - d) / 30) * 0.5;
      const noise = 0.9 + Math.random() * 0.2;
      const ctr = baseCtr * decay * noise;
      const cpa = baseCpa / decay * noise;
      const spend = 20 + Math.random() * 40;
      const impressions = Math.round(2000 + Math.random() * 5000);
      const clicks = Math.round(impressions * (ctr / 100));
      const purchases = Math.max(0, Math.round(spend / cpa));
      points.push({
        adId: ad.id, adName: ad.name,
        date: dt.toISOString().split('T')[0],
        ctr, cpa: purchases > 0 ? spend / purchases : 0,
        spend, impressions, clicks, purchases,
      });
    }
  }
  return points;
}

// ─── Knee detection ───────────────────────────────────────────────────────────

function rollingAvg(values: number[], window = 3): number[] {
  return values.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

function detectKnee(
  dates: string[],
  values: number[],
  metric: Metric,
  adId: string,
  adName: string,
): KneeInfo | null {
  if (values.length < 5) return null;

  const smoothed = rollingAvg(values);

  if (metric === 'ctr') {
    let peakIdx = 0;
    for (let i = 1; i < smoothed.length; i++) {
      if (smoothed[i] > smoothed[peakIdx]) peakIdx = i;
    }
    const peak = smoothed[peakIdx];
    if (peak === 0) return null;
    for (let i = peakIdx + 1; i < smoothed.length; i++) {
      if ((peak - smoothed[i]) / peak > 0.20) {
        return {
          adId, adName, date: dates[i],
          peakValue: peak, kneeValue: smoothed[i],
          daysBeforeDecline: i - peakIdx,
        };
      }
    }
  } else {
    let minIdx = 0;
    for (let i = 1; i < smoothed.length; i++) {
      if (smoothed[i] > 0 && (smoothed[minIdx] === 0 || smoothed[i] < smoothed[minIdx])) minIdx = i;
    }
    const min = smoothed[minIdx];
    if (min === 0) return null;
    for (let i = minIdx + 1; i < smoothed.length; i++) {
      if (smoothed[i] > 0 && (smoothed[i] - min) / min > 0.25) {
        return {
          adId, adName, date: dates[i],
          peakValue: min, kneeValue: smoothed[i],
          daysBeforeDecline: i - minIdx,
        };
      }
    }
  }

  return null;
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
  metric: Metric;
  adNameMap: Map<string, string>;
  cumulSpendMap: Map<string, Map<string, number>>;
}

function DecayTooltip({ active, payload, label, metric, adNameMap, cumulSpendMap }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  const dateLabel = new Date(label + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none max-w-xs">
      <p className="text-xs text-gray-500 font-medium mb-2">{dateLabel}</p>
      {payload.map((entry) => {
        const adId = entry.dataKey;
        const name = adNameMap.get(adId) ?? adId;
        const truncName = name.length > 30 ? name.slice(0, 27) + '…' : name;
        const val = metric === 'ctr' ? `${entry.value.toFixed(2)}%` : formatCurrency(entry.value);
        const cumulSpend = cumulSpendMap.get(adId)?.get(label) ?? 0;
        return (
          <div key={adId} className="flex items-center gap-2 text-xs mb-1">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-700 truncate">{truncName}</span>
            <span className="ml-auto font-mono font-bold" style={{ color: entry.color }}>{val}</span>
            {cumulSpend > 0 && (
              <span className="text-gray-400 font-mono text-[10px]">({formatCurrency(cumulSpend)})</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Custom legend ────────────────────────────────────────────────────────────

interface LegendProps {
  adIds: string[];
  adNameMap: Map<string, string>;
  colorMap: Map<string, string>;
  hidden: Set<string>;
  onToggle: (id: string) => void;
}

function InteractiveLegend({ adIds, adNameMap, colorMap, hidden, onToggle }: LegendProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-3 px-2">
      {adIds.map((id) => {
        const isHidden = hidden.has(id);
        const name = adNameMap.get(id) ?? id;
        const truncName = name.length > 25 ? name.slice(0, 22) + '…' : name;
        return (
          <button
            key={id}
            onClick={() => onToggle(id)}
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
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  datePreset?: DatePreset;
}

export default function CreativeDecayCurve({ datePreset = 'last_30d' }: Props) {
  const [rawData, setRawData] = useState<RawPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('ctr');
  const [window, setWindow] = useState<Window>(30);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/creative-decay?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const data: RawPoint[] = json.data ?? [];
      setRawData(data.length > 0 ? data : generateMockData());
    } catch {
      setRawData(generateMockData());
      setError('Données mock (API indisponible)');
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => { load(); }, [load]);

  // Filter by window
  const windowData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - window);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    return rawData.filter((p) => p.date >= cutoffStr);
  }, [rawData, window]);

  // Top creatives by total spend (limit to 10 for readability)
  const topAdIds = useMemo(() => {
    const spendByAd = new Map<string, number>();
    for (const p of windowData) {
      spendByAd.set(p.adId, (spendByAd.get(p.adId) ?? 0) + p.spend);
    }
    return [...spendByAd.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
  }, [windowData]);

  const adNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of windowData) map.set(p.adId, p.adName);
    return map;
  }, [windowData]);

  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    topAdIds.forEach((id, i) => map.set(id, PALETTE[i % PALETTE.length]));
    return map;
  }, [topAdIds]);

  // Build chart data: each row = { date, [adId]: value, ... }
  const { chartData, cumulSpendMap } = useMemo(() => {
    const dateSet = new Set<string>();
    for (const p of windowData) {
      if (topAdIds.includes(p.adId)) dateSet.add(p.date);
    }
    const dates = [...dateSet].sort();

    // Rolling avg per ad
    const adTimeSeries = new Map<string, Map<string, number>>();
    const adRawSeries = new Map<string, { dates: string[]; values: number[] }>();
    const cumulMap = new Map<string, Map<string, number>>();

    for (const adId of topAdIds) {
      const points = windowData
        .filter((p) => p.adId === adId)
        .sort((a, b) => a.date.localeCompare(b.date));

      const vals = points.map((p) => p[metric]);
      const smoothed = rollingAvg(vals);
      const dateValMap = new Map<string, number>();
      const rawDates: string[] = [];
      const rawVals: number[] = [];
      let cumSpend = 0;
      const cumMap = new Map<string, number>();

      points.forEach((p, i) => {
        dateValMap.set(p.date, smoothed[i]);
        rawDates.push(p.date);
        rawVals.push(vals[i]);
        cumSpend += p.spend;
        cumMap.set(p.date, cumSpend);
      });

      adTimeSeries.set(adId, dateValMap);
      adRawSeries.set(adId, { dates: rawDates, values: rawVals });
      cumulMap.set(adId, cumMap);
    }

    const rows = dates.map((date) => {
      const row: Record<string, string | number> = { date };
      for (const adId of topAdIds) {
        const val = adTimeSeries.get(adId)?.get(date);
        if (val !== undefined) row[adId] = Math.round(val * 100) / 100;
      }
      return row;
    });

    return { chartData: rows, cumulSpendMap: cumulMap, adRawSeries };
  }, [windowData, topAdIds, metric]);

  // Knee detection
  const knees = useMemo((): KneeInfo[] => {
    const results: KneeInfo[] = [];
    for (const adId of topAdIds) {
      const points = windowData
        .filter((p) => p.adId === adId)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (points.length < 5) continue;

      const dates = points.map((p) => p.date);
      const values = points.map((p) => p[metric]);
      const knee = detectKnee(dates, values, metric, adId, adNameMap.get(adId) ?? adId);
      if (knee) results.push(knee);
    }
    return results;
  }, [windowData, topAdIds, metric, adNameMap]);

  const toggleHidden = (id: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const visibleAdIds = topAdIds.filter((id) => !hidden.has(id));

  const xInterval = Math.max(0, Math.floor((chartData.length / 7)) - 1);

  const formatDate = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  };

  return (
    <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Courbe de déclin créatif</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              CTR / CPA par créa · rolling avg 3 jours · top 10 par dépenses
              {error && <span className="ml-2 text-amber-500">{error}</span>}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Metric toggle */}
            <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-lg">
              {(['ctr', 'cpa'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                    metric === m
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {m === 'ctr' ? 'CTR (%)' : 'CPA ($)'}
                </button>
              ))}
            </div>

            {/* Window toggle */}
            <div className="flex items-center gap-0.5 bg-gray-100 p-0.5 rounded-lg">
              {([14, 21, 30] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setWindow(w)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                    window === w
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {w}j
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
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
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
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
                  tickFormatter={(v) => metric === 'ctr' ? `${v.toFixed(1)}%` : `$${v.toFixed(0)}`}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  content={(props) => (
                    <DecayTooltip
                      active={props.active}
                      payload={props.payload as TooltipProps['payload']}
                      label={props.label as string}
                      metric={metric}
                      adNameMap={adNameMap}
                      cumulSpendMap={cumulSpendMap}
                    />
                  )}
                  cursor={{ stroke: '#D1D5DB', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                {visibleAdIds.map((adId) => (
                  <Line
                    key={adId}
                    dataKey={adId}
                    stroke={colorMap.get(adId)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                    type="monotone"
                    connectNulls
                  />
                ))}
                {/* Knee dots */}
                {knees
                  .filter((k) => !hidden.has(k.adId))
                  .map((k) => {
                    const row = chartData.find((r) => r.date === k.date);
                    const val = row?.[k.adId];
                    if (val === undefined) return null;
                    return (
                      <ReferenceDot
                        key={`knee-${k.adId}`}
                        x={k.date}
                        y={val as number}
                        r={6}
                        fill="#EF4444"
                        stroke="#fff"
                        strokeWidth={2}
                      />
                    );
                  })}
              </LineChart>
            </ResponsiveContainer>

            {/* Interactive legend */}
            <InteractiveLegend
              adIds={topAdIds}
              adNameMap={adNameMap}
              colorMap={colorMap}
              hidden={hidden}
              onToggle={toggleHidden}
            />
          </>
        )}
      </div>

      {/* Knee summary table */}
      {knees.length > 0 && !loading && (
        <div className="border-t border-gray-100 px-6 py-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Points d&apos;inflexion détectés
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="py-2 pr-4 text-left text-gray-400 font-semibold">Créa</th>
                  <th className="py-2 px-4 text-right text-gray-400 font-semibold">Date du genou</th>
                  <th className="py-2 px-4 text-right text-gray-400 font-semibold">
                    {metric === 'ctr' ? 'CTR au pic' : 'CPA min.'}
                  </th>
                  <th className="py-2 px-4 text-right text-gray-400 font-semibold">
                    {metric === 'ctr' ? 'CTR au genou' : 'CPA au genou'}
                  </th>
                  <th className="py-2 pl-4 text-right text-gray-400 font-semibold">Jours avant déclin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {knees.map((k) => {
                  const color = colorMap.get(k.adId) ?? '#6B7280';
                  const truncName = k.adName.length > 35 ? k.adName.slice(0, 32) + '…' : k.adName;
                  const fmtVal = (v: number) => metric === 'ctr' ? `${v.toFixed(2)}%` : formatCurrency(v);
                  const dateLabel = new Date(k.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                  return (
                    <tr key={k.adId} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-gray-800 font-medium truncate max-w-[200px]">{truncName}</span>
                        </div>
                      </td>
                      <td className="py-2 px-4 text-right font-mono text-gray-700">{dateLabel}</td>
                      <td className="py-2 px-4 text-right font-mono text-green-600">{fmtVal(k.peakValue)}</td>
                      <td className="py-2 px-4 text-right font-mono text-red-500">{fmtVal(k.kneeValue)}</td>
                      <td className="py-2 pl-4 text-right font-mono text-gray-700">{k.daysBeforeDecline}j</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
