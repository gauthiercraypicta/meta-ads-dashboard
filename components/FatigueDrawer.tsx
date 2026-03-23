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
import {
  GroupedCreative,
  CreativeFormat,
  CreativeSignal,
  AdInsightAction,
} from '@/types/creative';

// ─── Configs ────────────────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<CreativeSignal, { label: string; bg: string; text: string; dot: string }> = {
  SCALE:   { label: 'Scaler',     bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  WATCH:   { label: 'Surveiller', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  FATIGUE: { label: 'Fatigue',    bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  CUT:     { label: 'Couper',     bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  NEW:     { label: 'Nouveau',    bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
};

const FORMAT_CONFIG: Record<CreativeFormat, { label: string; color: string }> = {
  VIDEO:    { label: 'Vidéo',    color: 'bg-purple-100 text-purple-700' },
  IMAGE:    { label: 'Statique', color: 'bg-blue-100 text-blue-700'     },
  SHOPPING: { label: 'Shopping', color: 'bg-teal-100 text-teal-700'     },
  UNKNOWN:  { label: '?',        color: 'bg-gray-100 text-gray-500'     },
};

const PURCHASE_TYPES = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];

// ─── Types ──────────────────────────────────────────────────────────────────
interface DailyPoint {
  date: string;
  ctr: number;
  frequency: number;
  spend: number;
  roas: number;
  hookRate: number;
  holdRate: number;
}

interface DailyInsight {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  frequency?: string;
  actions?: AdInsightAction[];
  action_values?: AdInsightAction[];
  purchase_roas?: AdInsightAction[];
  video_play_actions?: AdInsightAction[];
  video_thruplay_watched_actions?: AdInsightAction[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function fmt(n: number, d = 2): string { return n.toFixed(d); }
function fmtCurrency(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${n.toFixed(0)}€`;
}

function getActionValue(actions: AdInsightAction[] | undefined, types: string[]): number {
  if (!actions) return 0;
  for (const t of types) {
    const a = actions.find((x) => x.action_type === t);
    if (a) return parseFloat(a.value) || 0;
  }
  return 0;
}

function parseDailyInsights(raw: DailyInsight[]): DailyPoint[] {
  return raw.map((d) => {
    const impressions = parseFloat(d.impressions ?? '0') || 0;
    const clicks = parseFloat(d.clicks ?? '0') || 0;
    const spend = parseFloat(d.spend ?? '0') || 0;
    const ctr = parseFloat(d.ctr ?? '0') || 0;
    const frequency = parseFloat(d.frequency ?? '0') || 0;

    const purchaseValue = getActionValue(d.action_values, PURCHASE_TYPES);
    const roas = d.purchase_roas?.[0] ? parseFloat(d.purchase_roas[0].value) || 0
      : (spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0);

    const videoViews3s = getActionValue(d.actions, ['video_view']);
    const thruplay = getActionValue(d.video_thruplay_watched_actions, ['video_view']);
    const hookRate = impressions > 0 ? (videoViews3s / impressions) * 100 : 0;
    const holdRate = videoViews3s > 0 ? (thruplay / videoViews3s) * 100 : 0;

    return {
      date: new Date(d.date_start).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      ctr,
      frequency,
      spend,
      roas,
      hookRate,
      holdRate,
    };
  });
}

// ─── Custom tooltip ─────────────────────────────────────────────────────────
function FatigueTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs space-y-1">
      <p className="font-semibold text-gray-700">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name === 'ctr' ? 'CTR' : 'Fréquence'}</span>
          <span className="font-mono ml-auto">{p.name === 'ctr' ? `${p.value.toFixed(2)}%` : p.value.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function VideoTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 text-xs space-y-1">
      <p className="font-semibold text-gray-700">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name === 'hookRate' ? 'Hook Rate' : 'Hold Rate'}</span>
          <span className="font-mono ml-auto">{p.value.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Props ──────────────────────────────────────────────────────────────────
interface Props {
  creative: GroupedCreative | null;
  onClose: () => void;
  datePreset?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function FatigueDrawer({ creative, onClose, datePreset = 'last_30d' }: Props) {
  const [dailyData, setDailyData] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDaily = useCallback(async (adIds: string[]) => {
    setLoading(true);
    try {
      const allPoints: DailyInsight[] = [];
      // Fetch daily for all variant ad IDs, then merge by date
      const promises = adIds.map((id) =>
        fetch(`/api/ad-daily?ad_id=${id}&date_preset=${datePreset}`)
          .then((r) => r.json())
          .then((j) => (j.data ?? []) as DailyInsight[])
          .catch(() => [] as DailyInsight[])
      );
      const results = await Promise.all(promises);
      // Merge by date: sum spend/clicks/impressions, weighted avg frequency
      const dateMap = new Map<string, {
        spend: number; impressions: number; clicks: number; frequency: number; freqWeight: number;
        purchaseValue: number; roasSum: number; roasWeight: number;
        videoViews3s: number; thruplay: number;
      }>();
      for (const dayList of results) {
        for (const d of dayList) {
          const key = d.date_start;
          const prev = dateMap.get(key) ?? {
            spend: 0, impressions: 0, clicks: 0, frequency: 0, freqWeight: 0,
            purchaseValue: 0, roasSum: 0, roasWeight: 0,
            videoViews3s: 0, thruplay: 0,
          };
          const imp = parseFloat(d.impressions ?? '0') || 0;
          const sp = parseFloat(d.spend ?? '0') || 0;
          const cl = parseFloat(d.clicks ?? '0') || 0;
          const fr = parseFloat(d.frequency ?? '0') || 0;
          prev.spend += sp;
          prev.impressions += imp;
          prev.clicks += cl;
          prev.frequency += fr * imp;
          prev.freqWeight += imp;
          const pv = getActionValue(d.action_values, PURCHASE_TYPES);
          prev.purchaseValue += pv;
          const roasVal = d.purchase_roas?.[0] ? parseFloat(d.purchase_roas[0].value) || 0 : 0;
          if (roasVal > 0) { prev.roasSum += roasVal * sp; prev.roasWeight += sp; }
          prev.videoViews3s += getActionValue(d.actions, ['video_view']);
          prev.thruplay += getActionValue(d.video_thruplay_watched_actions, ['video_view']);
          dateMap.set(key, prev);
        }
      }
      const merged: DailyPoint[] = [...dateMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateStr, v]) => ({
          date: new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
          ctr: v.impressions > 0 ? (v.clicks / v.impressions) * 100 : 0,
          frequency: v.freqWeight > 0 ? v.frequency / v.freqWeight : 0,
          spend: v.spend,
          roas: v.roasWeight > 0 ? v.roasSum / v.roasWeight : (v.spend > 0 && v.purchaseValue > 0 ? v.purchaseValue / v.spend : 0),
          hookRate: v.impressions > 0 ? (v.videoViews3s / v.impressions) * 100 : 0,
          holdRate: v.videoViews3s > 0 ? (v.thruplay / v.videoViews3s) * 100 : 0,
        }));
      setDailyData(merged);
    } catch {
      setDailyData([]);
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => {
    if (!creative) { setDailyData([]); return; }
    const ids = creative.variants.map((v) => v.id);
    fetchDaily(ids);
  }, [creative, fetchDaily]);

  // Close on Escape
  useEffect(() => {
    if (!creative) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [creative, onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (creative) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [creative]);

  // ── Computed metrics ────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    if (dailyData.length === 0) return null;
    const first7 = dailyData.slice(0, 7);
    const last7 = dailyData.slice(-7);
    const ctrLaunch = first7.length > 0 ? first7.reduce((s, d) => s + d.ctr, 0) / first7.length : 0;
    const ctrCurrent = last7.length > 0 ? last7.reduce((s, d) => s + d.ctr, 0) / last7.length : 0;
    const ctrDelta = ctrLaunch > 0 ? ((ctrCurrent - ctrLaunch) / ctrLaunch) * 100 : 0;
    const freqCurrent = last7.length > 0 ? last7.reduce((s, d) => s + d.frequency, 0) / last7.length : 0;
    const spendCumul = dailyData.reduce((s, d) => s + d.spend, 0);
    const avgRoas = (() => {
      const totalSpend = dailyData.reduce((s, d) => s + d.spend, 0);
      const weightedRoas = dailyData.reduce((s, d) => s + d.roas * d.spend, 0);
      return totalSpend > 0 ? weightedRoas / totalSpend : 0;
    })();
    return { ctrLaunch, ctrCurrent, ctrDelta, freqCurrent, spendCumul, avgRoas };
  }, [dailyData]);

  // ── Interpretation ──────────────────────────────────────────────────────
  const interpretation = useMemo(() => {
    if (!metrics || !creative) return null;
    const ctrChute = metrics.ctrDelta < -30;
    const freqHigh = metrics.freqCurrent > 3;
    const freqLow = metrics.freqCurrent < 2.5;
    const ctrStable = Math.abs(metrics.ctrDelta) <= 30;

    if (ctrChute && freqHigh) {
      return { text: 'Signal de fatigue détecté — envisager la coupe', color: 'text-red-600', bg: 'bg-red-50 border-red-200' };
    }
    if (ctrStable && freqLow) {
      return { text: 'Créa saine — potentiel de scale', color: 'text-green-600', bg: 'bg-green-50 border-green-200' };
    }
    if (ctrChute && !freqHigh) {
      return { text: 'Fatigue créative indépendante de la saturation — tester une nouvelle approche', color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' };
    }
    return { text: 'Créa en phase de surveillance — surveiller l\'évolution', color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' };
  }, [metrics, creative]);

  // ── Frequency fatigue threshold line ────────────────────────────────────
  const hasFreqFatigue = useMemo(
    () => dailyData.some((d) => d.frequency > 4),
    [dailyData],
  );

  const isVideo = creative?.format === 'VIDEO';

  if (!creative) return null;

  const g = creative;
  const fmtCfg = FORMAT_CONFIG[g.format];
  const sigCfg = SIGNAL_CONFIG[g.signal];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 z-50 h-full w-full max-w-[480px] bg-white shadow-2xl overflow-y-auto transition-transform duration-300 ease-out">

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-3">
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
              {g.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={g.thumbnailUrl} alt={g.creativeName} loading="lazy" className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <span className="text-gray-300 text-lg">
                  {g.format === 'VIDEO' ? '▶' : g.format === 'SHOPPING' ? '🛒' : '🖼'}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-gray-900 truncate" title={g.rawName}>
                {g.creativeName || g.rawName}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${fmtCfg.color}`}>
                  {fmtCfg.label}
                </span>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sigCfg.bg} ${sigCfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sigCfg.dot}`} />
                  {sigCfg.label}
                </span>
                <span className="text-[10px] text-gray-400">{g.ageDays}j</span>
              </div>
            </div>

            {/* Close */}
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="p-5 space-y-5">

          {/* ── Main chart: CTR + Frequency ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Courbe de fatigue — CTR vs Fréquence
            </h3>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-gray-400 text-sm animate-pulse">
                Chargement des données…
              </div>
            ) : dailyData.length > 0 ? (
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                    <YAxis yAxisId="ctr" tick={{ fontSize: 10, fill: '#3b82f6' }}
                      tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                      label={{ value: 'CTR %', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 10 }} />
                    <YAxis yAxisId="freq" orientation="right" tick={{ fontSize: 10, fill: '#f97316' }}
                      tickFormatter={(v: number) => v.toFixed(1)}
                      label={{ value: 'Fréquence', angle: 90, position: 'insideRight', fill: '#f97316', fontSize: 10 }} />
                    <Tooltip content={<FatigueTooltip />} />
                    <Line yAxisId="ctr" type="monotone" dataKey="ctr" stroke="#3b82f6" strokeWidth={2} dot={false} name="ctr" />
                    <Line yAxisId="freq" type="monotone" dataKey="frequency" stroke="#f97316" strokeWidth={2} dot={false} name="frequency" />
                    {hasFreqFatigue && (
                      <ReferenceLine yAxisId="freq" y={4} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5}
                        label={{ value: 'Seuil fatigue', position: 'right', fill: '#ef4444', fontSize: 9 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-gray-400 text-xs bg-gray-50 rounded-xl border border-gray-200">
                Pas de données quotidiennes disponibles
              </div>
            )}
          </div>

          {/* ── Video chart: Hook Rate + Hold Rate (if video) ── */}
          {isVideo && dailyData.length > 0 && dailyData.some((d) => d.hookRate > 0) && (
            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Hook Rate & Hold Rate dans le temps
              </h3>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                    <YAxis yAxisId="hook" tick={{ fontSize: 10, fill: '#3b82f6' }}
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      label={{ value: 'Hook %', angle: -90, position: 'insideLeft', fill: '#3b82f6', fontSize: 10 }} />
                    <YAxis yAxisId="hold" orientation="right" tick={{ fontSize: 10, fill: '#22c55e' }}
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      label={{ value: 'Hold %', angle: 90, position: 'insideRight', fill: '#22c55e', fontSize: 10 }} />
                    <Tooltip content={<VideoTooltip />} />
                    <Line yAxisId="hook" type="monotone" dataKey="hookRate" stroke="#3b82f6" strokeWidth={2} dot={false} name="hookRate" />
                    <Line yAxisId="hold" type="monotone" dataKey="holdRate" stroke="#22c55e" strokeWidth={2} dot={false} name="holdRate" />
                    <ReferenceLine yAxisId="hook" y={30} stroke="#3b82f6" strokeDasharray="4 4" strokeWidth={1} />
                    <ReferenceLine yAxisId="hold" y={25} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Metric cards ── */}
          {metrics && (
            <div className="grid grid-cols-2 gap-3">
              {/* CTR launch vs current */}
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">CTR lancement vs actuel</p>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-gray-900">{fmt(metrics.ctrCurrent)}%</span>
                  <span className={`text-[10px] font-semibold ${
                    metrics.ctrDelta > 0 ? 'text-green-600' : metrics.ctrDelta < -30 ? 'text-red-600' : 'text-orange-500'
                  }`}>
                    {metrics.ctrDelta > 0 ? '+' : ''}{fmt(metrics.ctrDelta, 0)}%
                  </span>
                </div>
                <p className="text-[10px] text-gray-400">vs {fmt(metrics.ctrLaunch)}% (j1-j7)</p>
              </div>

              {/* Frequency vs threshold */}
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Fréquence actuelle</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-sm font-bold ${
                    metrics.freqCurrent > 4 ? 'text-red-600' : metrics.freqCurrent > 3 ? 'text-orange-500' : 'text-gray-900'
                  }`}>{fmt(metrics.freqCurrent, 1)}</span>
                  <span className="text-[10px] text-gray-400">/ seuil 4</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1.5">
                  <div
                    className={`h-1.5 rounded-full ${
                      metrics.freqCurrent > 4 ? 'bg-red-500' : metrics.freqCurrent > 3 ? 'bg-orange-400' : 'bg-green-400'
                    }`}
                    style={{ width: `${Math.min(100, (metrics.freqCurrent / 4) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Spend cumulé */}
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Spend cumulé</p>
                <p className="text-sm font-bold text-gray-900">{fmtCurrency(metrics.spendCumul)}</p>
                <p className="text-[10px] text-gray-400">sur la période</p>
              </div>

              {/* ROAS moyen */}
              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">ROAS moyen</p>
                <p className={`text-sm font-bold ${
                  metrics.avgRoas >= 3 ? 'text-green-600' : metrics.avgRoas >= 2 ? 'text-green-500' : metrics.avgRoas >= 1.5 ? 'text-yellow-600' : metrics.avgRoas >= 1 ? 'text-orange-500' : 'text-red-500'
                }`}>{fmt(metrics.avgRoas)}x</p>
                <p className="text-[10px] text-gray-400">durée de vie</p>
              </div>
            </div>
          )}

          {/* ── Interpretation ── */}
          {interpretation && (
            <div className={`rounded-xl border px-4 py-3 ${interpretation.bg}`}>
              <p className={`text-xs font-semibold ${interpretation.color}`}>
                {interpretation.text}
              </p>
            </div>
          )}

          {/* ── Ad set breakdown ── */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Détail par Ad Set ({g.variants.length})
            </h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide">Ad Set</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">Spend</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">ROAS</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">CTR</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">Fréq.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.variants.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700 font-medium truncate max-w-[140px]" title={v.adSetName}>
                          {v.adSetName || '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{v.spend > 0 ? fmtCurrency(v.spend) : '—'}</td>
                        <td className={`px-3 py-2 text-right ${
                          v.roas >= 3 ? 'text-green-600 font-bold' : v.roas >= 2 ? 'text-green-500' : v.roas >= 1.5 ? 'text-yellow-600' : v.roas >= 1 ? 'text-orange-500' : 'text-red-500'
                        }`}>{v.roas > 0 ? `${fmt(v.roas)}x` : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{v.ctr > 0 ? `${fmt(v.ctr)}%` : '—'}</td>
                        <td className={`px-3 py-2 text-right ${
                          v.frequency > 4.5 ? 'text-red-600 font-bold' : v.frequency > 3 ? 'text-orange-500' : 'text-gray-700'
                        }`}>{v.frequency > 0 ? fmt(v.frequency, 1) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
