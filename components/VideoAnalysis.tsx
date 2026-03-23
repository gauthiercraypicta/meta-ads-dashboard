'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
  LineChart, Line,
} from 'recharts';
import type { AdData, AdInsight, AdInsightAction } from '@/types/creative';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Props {
  refreshKey?: number;
  datePreset?: 'last_7d' | 'last_30d' | 'last_90d' | 'since_dec_1';
}

interface VideoRow {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  ageDays: number;
  hookRate: number;
  holdRate: number;
  ctr: number;
  cpm: number;
  roas: number;
  spend: number;
  impressions: number;
  videoViews3s: number;
  thruplay: number;
  clicks: number;
  purchases: number;
  signal: string;
}

interface DailyPoint {
  date: string;
  dateRaw: string;
  hookRate: number;
  holdRate: number;
}

type SortKey = 'name' | 'ageDays' | 'hookRate' | 'holdRate' | 'ctr' | 'cpm' | 'roas' | 'spend' | 'impressions';

// ─── Helpers ────────────────────────────────────────────────────────────────
const PURCHASE_TYPES = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];

function getActionValue(actions: AdInsightAction[] | undefined, actionType: string): number {
  if (!actions) return 0;
  const entry = actions.find((a) => a.action_type === actionType);
  return entry ? parseFloat(entry.value) || 0 : 0;
}

function isVideoAd(ad: AdData): boolean {
  return !!ad.creative?.video_id || (ad.creative?.object_type?.toUpperCase().includes('VIDEO') ?? false);
}

function computeSignal(row: { hookRate: number; roas: number; spend: number }): string {
  if (row.spend < 10) return 'NEW';
  if (row.hookRate >= 30 && row.roas >= 2) return 'SCALE';
  if (row.hookRate >= 20 && row.roas >= 1.5) return 'WATCH';
  if (row.hookRate < 15 || row.roas < 1) return 'CUT';
  return 'FATIGUE';
}

function signalBadge(signal: string) {
  const cfg: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    SCALE:   { bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  label: 'Scaler' },
    WATCH:   { bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Surveiller' },
    FATIGUE: { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500', label: 'Fatigue' },
    CUT:     { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    label: 'Couper' },
    NEW:     { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-400',   label: 'Nouveau' },
  };
  const c = cfg[signal] ?? cfg.NEW;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

function signalColor(signal: string): string {
  if (signal === 'SCALE') return 'hsl(120,60%,45%)';
  if (signal === 'WATCH') return 'hsl(45,90%,50%)';
  return 'hsl(0,70%,50%)';
}

function hookColor(v: number): string {
  if (v >= 30) return 'text-green-600 font-semibold';
  if (v >= 15) return 'text-orange-500 font-semibold';
  return 'text-red-600 font-semibold';
}

function holdColor(v: number): string {
  if (v >= 25) return 'text-green-600 font-semibold';
  if (v >= 10) return 'text-orange-500 font-semibold';
  return 'text-red-600 font-semibold';
}

function roasColor(v: number): string {
  if (v >= 3) return 'text-green-600 font-bold';
  if (v >= 2) return 'text-green-500';
  if (v >= 1.5) return 'text-yellow-600';
  if (v >= 1) return 'text-orange-500';
  return 'text-red-500';
}

function fmtCurrency(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${n.toFixed(0)}€`;
}

function fmt(n: number, d = 2) { return n.toFixed(d); }

function getInterpretation(hook: number, hold: number): { text: string; color: string } {
  if (hook >= 30 && hold >= 25) return { text: 'Créa saine — candidat au scale', color: 'text-green-600' };
  if (hook >= 30 && hold < 25) return { text: 'Accroche efficace mais contenu ne retient pas — retravailler la suite', color: 'text-orange-600' };
  if (hook < 30 && hold >= 25) return { text: 'Problème sur les 3 premières secondes — retravailler le début', color: 'text-yellow-600' };
  return { text: 'Performance globale faible — envisager la coupe', color: 'text-red-600' };
}

// ─── Parse video rows ───────────────────────────────────────────────────────
function parseVideoRows(ads: AdData[]): VideoRow[] {
  return ads.filter(isVideoAd).map((ad) => {
    const insight: AdInsight = ad.insights?.data?.[0] ?? {};
    const impressions = parseFloat(insight.impressions ?? '0') || 0;
    const spend = parseFloat(insight.spend ?? '0') || 0;
    const clicks = parseFloat(insight.clicks ?? '0') || 0;
    const ctr = parseFloat(insight.ctr ?? '0') || 0;
    const cpm = parseFloat(insight.cpm ?? '0') || 0;
    const videoViews3s = getActionValue(insight.actions, 'video_view');
    const thruplay = getActionValue(insight.video_thruplay_watched_actions, 'video_view');
    const roas = insight.purchase_roas?.[0] ? parseFloat(insight.purchase_roas[0].value) || 0 : 0;
    const purchases = (() => {
      for (const t of PURCHASE_TYPES) {
        const a = (insight.actions ?? []).find((x) => x.action_type === t);
        if (a) return parseFloat(a.value) || 0;
      }
      return 0;
    })();
    const hookRate = impressions > 0 ? (videoViews3s / impressions) * 100 : 0;
    const holdRate = videoViews3s > 0 ? (thruplay / videoViews3s) * 100 : 0;
    const ageDays = Math.floor((Date.now() - new Date(ad.created_time).getTime()) / 86_400_000);

    const partial = { id: ad.id, name: ad.name, thumbnailUrl: ad.creative?.thumbnail_url ?? null, ageDays, hookRate, holdRate, ctr, cpm, roas, spend, impressions, videoViews3s, thruplay, clicks, purchases };
    return { ...partial, signal: computeSignal(partial) };
  });
}

// ─── Tooltips ───────────────────────────────────────────────────────────────
function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: VideoRow }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1 max-w-[240px]">
      <p className="font-semibold text-gray-800 truncate">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
        <span>Hook Rate</span><span className="font-mono text-right">{d.hookRate.toFixed(1)}%</span>
        <span>Hold Rate</span><span className="font-mono text-right">{d.holdRate.toFixed(1)}%</span>
        <span>Spend</span><span className="font-mono text-right">{fmtCurrency(d.spend)}</span>
        <span>ROAS</span><span className="font-mono text-right">{d.roas.toFixed(2)}x</span>
      </div>
      <div className="pt-1">{signalBadge(d.signal)}</div>
    </div>
  );
}

function LineTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string; color: string }[]; label?: string }) {
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

// ─── Component ──────────────────────────────────────────────────────────────
export default function VideoAnalysis({ refreshKey, datePreset = 'last_30d' }: Props) {
  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('hookRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);

  const fetchAds = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ads?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setAds(json.data ?? []);
    } catch { setError('Erreur de chargement des données vidéo'); }
    finally { setLoading(false); }
  }, [datePreset]);

  useEffect(() => { fetchAds(); }, [fetchAds, refreshKey]);

  const allRows = useMemo(() => parseVideoRows(ads), [ads]);
  const rows = useMemo(() => allRows.filter((r) => r.spend > 0), [allRows]);

  // ── Summary ────────────────────────────────────────────────────────────
  const totalSpendAll = useMemo(() => {
    return ads.reduce((s, ad) => s + (parseFloat(ad.insights?.data?.[0]?.spend ?? '0') || 0), 0);
  }, [ads]);

  const totalSpendVideo = useMemo(() => rows.reduce((s, r) => s + r.spend, 0), [rows]);
  const totalImps = useMemo(() => rows.reduce((s, r) => s + r.impressions, 0), [rows]);
  const totalV3s = useMemo(() => rows.reduce((s, r) => s + r.videoViews3s, 0), [rows]);
  const totalThru = useMemo(() => rows.reduce((s, r) => s + r.thruplay, 0), [rows]);

  const avgHookRate = useMemo(() => totalImps > 0 ? (totalV3s / totalImps) * 100 : 0, [totalV3s, totalImps]);
  const avgHoldRate = useMemo(() => totalV3s > 0 ? (totalThru / totalV3s) * 100 : 0, [totalThru, totalV3s]);
  const spendPct = useMemo(() => totalSpendAll > 0 ? (totalSpendVideo / totalSpendAll) * 100 : 0, [totalSpendVideo, totalSpendAll]);

  const roasComparison = useMemo(() => {
    const videoSpend = rows.reduce((s, r) => s + r.spend, 0);
    const videoPV = rows.reduce((s, r) => s + r.roas * r.spend, 0);
    const videoRoas = videoSpend > 0 ? videoPV / videoSpend : 0;

    const staticAds = ads.filter((ad) => !isVideoAd(ad));
    const staticSpend = staticAds.reduce((s, ad) => s + (parseFloat(ad.insights?.data?.[0]?.spend ?? '0') || 0), 0);
    const staticPV = staticAds.reduce((s, ad) => {
      const roas = ad.insights?.data?.[0]?.purchase_roas?.[0]?.value;
      const sp = parseFloat(ad.insights?.data?.[0]?.spend ?? '0') || 0;
      return s + (roas ? parseFloat(roas) * sp : 0);
    }, 0);
    const staticRoas = staticSpend > 0 ? staticPV / staticSpend : 0;

    return { videoRoas, staticRoas, better: videoRoas >= staticRoas };
  }, [ads, rows]);

  // ── Sort ────────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (typeof av === 'string' && typeof bv === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  function sortInd(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  // ── Selected creative for line chart ────────────────────────────────────
  const defaultSelected = useMemo(() => {
    if (!rows.length) return null;
    return '__all__';
  }, [rows]);

  const activeSelected = selectedCreative ?? defaultSelected;

  // ── Daily data (simulated from single-period for now) ──────────────────
  // In real implementation, this would fetch from /api/ad-daily
  // For now, show the scatter + table which are the most valuable

  // ── Scatter data ────────────────────────────────────────────────────────
  const maxSpend = useMemo(() => Math.max(1, ...rows.map((r) => r.spend)), [rows]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-32 flex items-center justify-center text-gray-400 text-sm animate-pulse">
          Chargement de l&apos;analyse vidéo…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-32 flex items-center justify-center text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  if (!rows.length) return null; // Hidden if no video creatives

  return (
    <div className="space-y-4">
      {/* ── Section header ── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900">Analyse Vidéo</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {rows.length} créa{rows.length > 1 ? 's' : ''} vidéo active{rows.length > 1 ? 's' : ''} · {fmtCurrency(totalSpendVideo)} spend · Hook Rate moy. {avgHookRate.toFixed(1)}% · Hold Rate moy. {avgHoldRate.toFixed(1)}%
        </p>
      </div>

      {/* ── Level 1: Diagnostic cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Hook Rate moyen */}
        <DiagCard
          label="Hook Rate moyen"
          value={`${avgHookRate.toFixed(1)}%`}
          status={avgHookRate >= 30 ? 'ok' : avgHookRate >= 15 ? 'warning' : 'critical'}
          detail="Vues 3s / Impressions (pond. spend)"
          action={avgHookRate >= 30 ? 'Bonnes accroches — maintenir' : avgHookRate >= 15 ? 'Hook moyen — retravailler les 3 premières secondes' : 'Hook insuffisant — retravailler les 3 premières secondes'}
        />
        {/* Hold Rate moyen */}
        <DiagCard
          label="Hold Rate moyen"
          value={`${avgHoldRate.toFixed(1)}%`}
          status={avgHoldRate >= 25 ? 'ok' : avgHoldRate >= 10 ? 'warning' : 'critical'}
          detail="ThruPlay / Vues 3s (pond. spend)"
          action={avgHoldRate >= 25 ? 'Bonne rétention — le contenu engage' : avgHoldRate >= 10 ? 'Rétention moyenne — améliorer le mid-roll' : 'Rétention faible — le contenu ne retient pas'}
        />
        {/* Part spend vidéo */}
        <DiagCard
          label="Part spend vidéo"
          value={`${spendPct.toFixed(0)}%`}
          status={spendPct >= 50 ? 'ok' : spendPct >= 30 ? 'warning' : 'critical'}
          detail={`${fmtCurrency(totalSpendVideo)} / ${fmtCurrency(totalSpendAll)}`}
          action={spendPct >= 50 ? 'Budget vidéo bien réparti' : spendPct >= 30 ? 'Augmenter la part vidéo si ROAS favorable' : 'Budget vidéo trop faible — réévaluer l\'allocation'}
        />
        {/* ROAS vidéo vs statique */}
        <DiagCard
          label="ROAS vidéo vs statique"
          value={`${roasComparison.videoRoas.toFixed(2)}x`}
          status={roasComparison.better ? 'ok' : 'warning'}
          detail={`vs ${roasComparison.staticRoas.toFixed(2)}x statique`}
          action={roasComparison.better ? 'La vidéo surperforme — renforcer la prod vidéo' : 'Le statique surperforme — réévaluer le budget vidéo'}
        />
      </div>

      {/* ── Level 4: Matrice Hook vs Hold (scatter) ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Matrice Hook vs Hold</h3>
          <p className="text-xs text-gray-500 mt-0.5">Taille = spend · Couleur = signal · Quadrant = diagnostic</p>
        </div>
        {rows.length > 0 ? (
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              {/* Quadrant backgrounds */}
              <ReferenceArea x1={30} x2={100} y1={25} y2={100} fill="#dcfce7" fillOpacity={0.3} />
              <ReferenceArea x1={0} x2={30} y1={25} y2={100} fill="#fef9c3" fillOpacity={0.3} />
              <ReferenceArea x1={30} x2={100} y1={0} y2={25} fill="#ffedd5" fillOpacity={0.3} />
              <ReferenceArea x1={0} x2={30} y1={0} y2={25} fill="#fee2e2" fillOpacity={0.3} />
              <XAxis
                type="number" dataKey="hookRate" domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                label={{ value: 'Hook Rate (%)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="holdRate" domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                label={{ value: 'Hold Rate (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
              />
              <ReferenceLine x={30} stroke="#d1d5db" strokeDasharray="4 4" />
              <ReferenceLine y={25} stroke="#d1d5db" strokeDasharray="4 4" />
              <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={rows}>
                {rows.map((entry) => {
                  const r = Math.max(8, Math.min(32, Math.sqrt(entry.spend / maxSpend) * 32));
                  return <Cell key={entry.id} fill={signalColor(entry.signal)} fillOpacity={0.7} r={r} />;
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">Pas de données</div>
        )}
        {/* Quadrant legend */}
        <div className="flex flex-wrap gap-4 mt-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100" /> Hook &gt; 30% + Hold &gt; 25% : A scaler</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100" /> Hook &lt; 30% + Hold &gt; 25% : Retravailler le début</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100" /> Hook &gt; 30% + Hold &lt; 25% : Contenu décevant</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> Hook &lt; 30% + Hold &lt; 25% : A couper</span>
        </div>
      </div>

      {/* ── Level 2: Funnel table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Funnel d&apos;attention par créa</h3>
          <div className="flex gap-4 mt-1.5 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-400" /> Impressions (base 100%)</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-400" /> Hook Rate — % qui regardent 3s</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-400" /> Hold Rate — % des 3s qui finissent la vidéo</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2 text-left font-medium">Créative</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('ageDays')}>Âge{sortInd('ageDays')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('impressions')}>Impr.{sortInd('impressions')}</th>
                <th className="px-4 py-2 text-right font-medium">Vues 3s</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('hookRate')}>Hook Rate{sortInd('hookRate')}</th>
                <th className="px-4 py-2 text-right font-medium">ThruPlay</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('holdRate')}>Hold Rate{sortInd('holdRate')}</th>
                <th className="px-4 py-2 text-center font-medium">Funnel</th>
                <th className="px-4 py-2 text-right font-medium">Clics</th>
                <th className="px-4 py-2 text-right font-medium">Achats</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('roas')}>ROAS{sortInd('roas')}</th>
                <th className="px-4 py-2 text-center font-medium">Signal</th>
                <th className="px-4 py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((row) => {
                const interp = getInterpretation(row.hookRate, row.holdRate);
                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {row.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.thumbnailUrl} alt="" loading="lazy" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">▶</div>
                        )}
                        <span className="text-gray-800 truncate max-w-[140px]" title={row.name}>{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{row.ageDays}j</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{row.impressions.toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{row.videoViews3s.toLocaleString('fr-FR')}</td>
                    <td className={`px-4 py-2 text-right font-mono ${hookColor(row.hookRate)}`}>{row.hookRate.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{row.thruplay.toLocaleString('fr-FR')}</td>
                    <td className={`px-4 py-2 text-right font-mono ${holdColor(row.holdRate)}`}>{row.holdRate.toFixed(1)}%</td>
                    {/* Funnel bar */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-2.5 w-20 rounded-full overflow-hidden bg-gray-100">
                          <div className="bg-blue-400" style={{ width: '100%' }} />
                        </div>
                        <span className="text-[9px] text-gray-400 w-10">Impr.</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex h-2.5 w-20 rounded-full overflow-hidden bg-gray-100">
                          <div className="bg-green-400" style={{ width: `${Math.min(100, row.hookRate)}%` }} />
                        </div>
                        <span className="text-[9px] text-gray-400 w-10">{row.hookRate.toFixed(0)}%</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex h-2.5 w-20 rounded-full overflow-hidden bg-gray-100">
                          <div className="bg-orange-400" style={{ width: `${Math.min(100, row.holdRate)}%` }} />
                        </div>
                        <span className="text-[9px] text-gray-400 w-10">{row.holdRate.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{row.clicks.toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{row.purchases > 0 ? row.purchases : '—'}</td>
                    <td className={`px-4 py-2 text-right font-mono ${roasColor(row.roas)}`}>{row.roas > 0 ? `${row.roas.toFixed(2)}x` : '—'}</td>
                    <td className="px-4 py-2 text-center">{signalBadge(row.signal)}</td>
                    <td className="px-4 py-2">
                      <span className="cursor-help text-gray-400 hover:text-gray-600" title={interp.text}>ⓘ</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
          {rows.length} vidéo{rows.length > 1 ? 's' : ''} · Tri par défaut : Hook Rate décroissant
        </div>
      </div>

      {/* ── Level 3: Hook & Hold Rate temporal curves ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Évolution Hook & Hold Rate</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Sélectionne une créa pour l&apos;isoler · Seuils : Hook &gt; 30% · Hold &gt; 25%
          </p>
        </div>
        {/* Creative selector pills */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <button
            onClick={() => setSelectedCreative('__all__')}
            className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors ${
              activeSelected === '__all__' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            All ({rows.length})
          </button>
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedCreative(r.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors flex items-center gap-1.5 ${
                activeSelected === r.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {r.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.thumbnailUrl} alt="" className="w-4 h-4 rounded-sm object-cover" />
              )}
              {r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name}
            </button>
          ))}
        </div>

        {/* Selected creative detail or all-creatives grid */}
        {activeSelected === '__all__' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {rows.map((r) => {
              const interp = getInterpretation(r.hookRate, r.holdRate);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedCreative(r.id)}
                  className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm">▶</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-gray-800 truncate" title={r.name}>{r.name}</p>
                      <p className="text-[10px] text-gray-400">{r.ageDays}j · {fmtCurrency(r.spend)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    <div>
                      <span className="text-gray-400">Hook</span>
                      <span className={`ml-1 font-mono font-semibold ${hookColor(r.hookRate)}`}>{r.hookRate.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Hold</span>
                      <span className={`ml-1 font-mono font-semibold ${holdColor(r.holdRate)}`}>{r.holdRate.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">ROAS</span>
                      <span className={`ml-1 font-mono font-semibold ${roasColor(r.roas)}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : '—'}</span>
                    </div>
                    <div>{signalBadge(r.signal)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            {rows.filter((r) => activeSelected === r.id).map((r) => (
              <div key={r.id} className="flex gap-5 items-start">
                {/* Thumbnail preview */}
                <div className="shrink-0">
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnailUrl} alt={r.name} className="w-28 h-28 rounded-xl object-cover border border-gray-200" />
                  ) : (
                    <div className="w-28 h-28 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 text-2xl">▶</div>
                  )}
                  <p className="text-[10px] text-gray-500 mt-1.5 text-center truncate max-w-[112px]" title={r.name}>{r.name}</p>
                </div>
                {/* Metrics */}
                <div className="flex-1 space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Hook Rate</p>
                      <p className={`text-lg font-bold ${hookColor(r.hookRate)}`}>{r.hookRate.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Hold Rate</p>
                      <p className={`text-lg font-bold ${holdColor(r.holdRate)}`}>{r.holdRate.toFixed(1)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">ROAS</p>
                      <p className={`text-lg font-bold ${roasColor(r.roas)}`}>{r.roas.toFixed(2)}x</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] text-gray-400 uppercase">Spend</p>
                      <p className="text-lg font-bold text-gray-900">{fmtCurrency(r.spend)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {signalBadge(r.signal)}
                    <p className={`text-xs font-medium ${getInterpretation(r.hookRate, r.holdRate).color}`}>
                      {getInterpretation(r.hookRate, r.holdRate).text}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Diagnostic Card ────────────────────────────────────────────────────────
type DiagStatus = 'ok' | 'warning' | 'critical';

const DIAG_CFG: Record<DiagStatus, { badge: string; border: string; dot: string; label: string; actionColor: string }> = {
  ok:       { badge: 'bg-green-100 text-green-700',  border: 'border-green-200 bg-green-50/50',  dot: 'bg-green-500',  label: 'OK',        actionColor: 'text-green-600' },
  warning:  { badge: 'bg-amber-100 text-amber-700',  border: 'border-amber-200 bg-amber-50/50',  dot: 'bg-amber-500',  label: 'Attention', actionColor: 'text-amber-600' },
  critical: { badge: 'bg-red-100 text-red-700',      border: 'border-red-200 bg-red-50/50',      dot: 'bg-red-500',    label: 'Critique',  actionColor: 'text-red-500'   },
};

function DiagCard({ label, value, status, detail, action }: {
  label: string; value: string; status: DiagStatus; detail: string; action: string;
}) {
  const s = DIAG_CFG[status];
  return (
    <div className={`border rounded-xl px-4 py-3.5 flex flex-col ${s.border}`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-gray-600">{label}</p>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${s.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
          {s.label}
        </span>
      </div>
      <p className="text-2xl font-extrabold text-gray-900 leading-none mb-0.5">{value}</p>
      <p className="text-[11px] text-gray-400 mb-2">{detail}</p>
      <p className={`text-[11px] font-semibold ${s.actionColor} mt-auto`}>{action}</p>
    </div>
  );
}
