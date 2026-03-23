'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine, ReferenceArea,
} from 'recharts';
import type { AdData, AdInsight, AdInsightAction } from '@/types/creative';

// ─── Types ──────────────────────────────────────────────────────────────────
interface Props {
  refreshKey?: number;
  datePreset?: 'last_7d' | 'last_30d' | 'last_90d';
}

interface StaticRow {
  id: string;
  name: string;
  format: 'IMAGE' | 'SHOPPING';
  thumbnailUrl: string | null;
  ageDays: number;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  ctr: number;
  cvr: number;
  ratioCtrCvr: number;
  frequency: number;
  cpa: number;
  roas: number;
  signal: string;
}

type SortKey = 'name' | 'ageDays' | 'spend' | 'ctr' | 'cvr' | 'ratioCtrCvr' | 'frequency' | 'cpa' | 'roas';

// ─── Helpers ────────────────────────────────────────────────────────────────
const PURCHASE_TYPES = ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase'];

function isVideoAd(ad: AdData): boolean {
  return !!ad.creative?.video_id || (ad.creative?.object_type?.toUpperCase().includes('VIDEO') ?? false);
}

function computeSignal(row: { spend: number; roas: number; frequency: number }): string {
  if (row.spend < 15) return 'NEW';
  if (row.frequency > 4.5 || (row.roas < 1.0 && row.spend > 80)) return 'CUT';
  if (row.frequency > 3.0 && row.roas < 1.5) return 'FATIGUE';
  if (row.roas >= 2.5 && row.frequency <= 2.5) return 'SCALE';
  return 'WATCH';
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

function ctrColor(v: number): string {
  if (v >= 1) return 'text-green-600 font-semibold';
  if (v >= 0.5) return 'text-orange-500 font-semibold';
  return 'text-red-600 font-semibold';
}
function cvrColor(v: number): string {
  if (v >= 3) return 'text-green-600 font-semibold';
  if (v >= 1) return 'text-orange-500 font-semibold';
  return 'text-red-600 font-semibold';
}
function ratioColor(v: number): string {
  if (v >= 300) return 'text-green-600 font-semibold';
  if (v >= 150) return 'text-orange-500 font-semibold';
  return 'text-red-600 font-semibold';
}
function freqColor(v: number): string {
  if (v > 4) return 'text-red-600 font-bold';
  if (v > 2.5) return 'text-orange-500 font-semibold';
  return 'text-green-600';
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

function getInterpretation(row: StaticRow): { text: string; color: string } {
  if (row.frequency > 4) return { text: 'Seuil de saturation dépassé — coupe ou rotation urgente', color: 'text-red-600' };
  if (row.ctr >= 1 && row.cvr >= 3) return { text: 'Double performance — candidat au scale', color: 'text-green-600' };
  if (row.ctr >= 1 && row.cvr < 1) return { text: "L'image accroche mais la landing ne convertit pas", color: 'text-orange-600' };
  if (row.ctr < 0.5 && row.frequency < 2) return { text: "Fatigue créative pure — l'image ne fonctionne pas", color: 'text-red-600' };
  if (row.ctr < 0.5 && row.frequency > 3) return { text: 'Saturation audience — réduire la fréquence ou rafraîchir', color: 'text-orange-600' };
  return { text: 'Créa en surveillance — surveiller CTR et fréquence', color: 'text-yellow-600' };
}

// ─── Parse static rows ──────────────────────────────────────────────────────
function parseStaticRows(ads: AdData[]): StaticRow[] {
  return ads.filter((ad) => !isVideoAd(ad)).map((ad) => {
    const insight: AdInsight = ad.insights?.data?.[0] ?? {};
    const impressions = parseFloat(insight.impressions ?? '0') || 0;
    const spend = parseFloat(insight.spend ?? '0') || 0;
    const clicks = parseFloat(insight.clicks ?? '0') || 0;
    const ctr = parseFloat(insight.ctr ?? '0') || 0;
    const frequency = parseFloat(insight.frequency ?? '0') || 0;
    const cpm = parseFloat(insight.cpm ?? '0') || 0;

    const purchases = (() => {
      for (const t of PURCHASE_TYPES) {
        const a = (insight.actions ?? []).find((x) => x.action_type === t);
        if (a) return parseFloat(a.value) || 0;
      }
      return 0;
    })();
    const purchaseValue = (() => {
      for (const t of PURCHASE_TYPES) {
        const a = (insight.action_values ?? []).find((x) => x.action_type === t);
        if (a) return parseFloat(a.value) || 0;
      }
      return 0;
    })();
    const roas = insight.purchase_roas?.[0] ? parseFloat(insight.purchase_roas[0].value) || 0
      : (spend > 0 && purchaseValue > 0 ? purchaseValue / spend : 0);
    const cpa = purchases > 0 ? spend / purchases : 0;
    const cvr = clicks > 0 ? (purchases / clicks) * 100 : 0;
    const ratioCtrCvr = ctr > 0 ? (cvr / ctr) * 100 : 0;
    const ageDays = Math.floor((Date.now() - new Date(ad.created_time).getTime()) / 86_400_000);

    const objType = ad.creative?.object_type?.toUpperCase() ?? '';
    const isShopping = objType === 'DYNAMIC' || ad.name.toLowerCase().includes('shoppingfeed') || ad.name.toLowerCase().includes('shopping') || ad.name.toLowerCase().includes('dpa');
    const format: 'IMAGE' | 'SHOPPING' = isShopping ? 'SHOPPING' : 'IMAGE';

    return {
      id: ad.id, name: ad.name, format, thumbnailUrl: ad.creative?.thumbnail_url ?? null,
      ageDays, spend, impressions, clicks, purchases, ctr, cvr, ratioCtrCvr, frequency, cpa, roas,
      signal: computeSignal({ spend, roas, frequency }),
    };
  });
}

// ─── Tooltips ───────────────────────────────────────────────────────────────
function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: StaticRow }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1 max-w-[240px]">
      <p className="font-semibold text-gray-800 truncate">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
        <span>Fréquence</span><span className="font-mono text-right">{d.frequency.toFixed(1)}</span>
        <span>CTR</span><span className="font-mono text-right">{d.ctr.toFixed(2)}%</span>
        <span>CVR</span><span className="font-mono text-right">{d.cvr.toFixed(1)}%</span>
        <span>Spend</span><span className="font-mono text-right">{fmtCurrency(d.spend)}</span>
        <span>ROAS</span><span className="font-mono text-right">{d.roas.toFixed(2)}x</span>
      </div>
      <div className="pt-1">{signalBadge(d.signal)}</div>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function StaticAnalysis({ refreshKey, datePreset = 'last_30d' }: Props) {
  const [ads, setAds] = useState<AdData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('ctr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedCreative, setSelectedCreative] = useState<string | null>(null);

  const fetchAds = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/ads?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      setAds(json.data ?? []);
    } catch { setError('Erreur de chargement'); }
    finally { setLoading(false); }
  }, [datePreset]);

  useEffect(() => { fetchAds(); }, [fetchAds, refreshKey]);

  const allRows = useMemo(() => parseStaticRows(ads), [ads]);
  const rows = useMemo(() => allRows.filter((r) => r.spend > 0), [allRows]);

  // ── Summary ────────────────────────────────────────────────────────────
  const totalSpendAll = useMemo(() => ads.reduce((s, ad) => s + (parseFloat(ad.insights?.data?.[0]?.spend ?? '0') || 0), 0), [ads]);
  const totalSpendStatic = useMemo(() => rows.reduce((s, r) => s + r.spend, 0), [rows]);
  const totalImps = useMemo(() => rows.reduce((s, r) => s + r.impressions, 0), [rows]);
  const totalClicks = useMemo(() => rows.reduce((s, r) => s + r.clicks, 0), [rows]);
  const totalPurchases = useMemo(() => rows.reduce((s, r) => s + r.purchases, 0), [rows]);

  // Weighted averages
  const avgCtr = useMemo(() => totalImps > 0 ? (totalClicks / totalImps) * 100 : 0, [totalClicks, totalImps]);
  const avgCvr = useMemo(() => totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : 0, [totalPurchases, totalClicks]);
  const avgRatio = useMemo(() => avgCtr > 0 ? (avgCvr / avgCtr) * 100 : 0, [avgCvr, avgCtr]);

  const roasComparison = useMemo(() => {
    const staticSpend = rows.reduce((s, r) => s + r.spend, 0);
    const staticPV = rows.reduce((s, r) => s + r.roas * r.spend, 0);
    const staticRoas = staticSpend > 0 ? staticPV / staticSpend : 0;

    const videoAds = ads.filter(isVideoAd);
    const videoSpend = videoAds.reduce((s, ad) => s + (parseFloat(ad.insights?.data?.[0]?.spend ?? '0') || 0), 0);
    const videoPV = videoAds.reduce((s, ad) => {
      const r = ad.insights?.data?.[0]?.purchase_roas?.[0]?.value;
      const sp = parseFloat(ad.insights?.data?.[0]?.spend ?? '0') || 0;
      return s + (r ? parseFloat(r) * sp : 0);
    }, 0);
    const videoRoas = videoSpend > 0 ? videoPV / videoSpend : 0;
    const hasVideo = videoAds.length > 0;

    return { staticRoas, videoRoas, better: staticRoas >= videoRoas, hasVideo };
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

  // ── Selected creative ──────────────────────────────────────────────────
  const defaultSelected = useMemo(() => rows.length ? '__all__' : null, [rows]);
  const activeSelected = selectedCreative ?? defaultSelected;

  // ── Scatter data ───────────────────────────────────────────────────────
  const maxSpend = useMemo(() => Math.max(1, ...rows.map((r) => r.spend)), [rows]);

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-32 flex items-center justify-center text-gray-400 text-sm animate-pulse">
          Chargement de l&apos;analyse statique…
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

  if (!rows.length) return null;

  return (
    <div className="space-y-4">
      {/* ── Section header ── */}
      <div className="border-t border-gray-200 pt-6">
        <h2 className="text-lg font-semibold text-gray-900">Analyse Statique</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {rows.length} créa{rows.length > 1 ? 's' : ''} statique{rows.length > 1 ? 's' : ''} active{rows.length > 1 ? 's' : ''} · {fmtCurrency(totalSpendStatic)} spend · CTR moy. {avgCtr.toFixed(2)}% · CVR moy. {avgCvr.toFixed(1)}%
        </p>
      </div>

      {/* ── Level 1: Diagnostic cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <DiagCard
          label="CTR moyen"
          value={`${avgCtr.toFixed(2)}%`}
          status={avgCtr >= 1 ? 'ok' : avgCtr >= 0.5 ? 'warning' : 'critical'}
          detail="Clics / Impressions (pond. spend)"
          action={avgCtr >= 1 ? 'Visuels performants — maintenir' : avgCtr >= 0.5 ? "CTR moyen — tester de nouveaux visuels" : "L'image n'arrête pas le scroll — tester de nouveaux visuels"}
        />
        <DiagCard
          label="CVR moyen"
          value={`${avgCvr.toFixed(1)}%`}
          status={avgCvr >= 3 ? 'ok' : avgCvr >= 1 ? 'warning' : 'critical'}
          detail="Achats / Clics (pond. spend)"
          action={avgCvr >= 3 ? 'Bonne conversion — landing page efficace' : avgCvr >= 1 ? "CVR moyen — vérifier la cohérence visuelle" : "L'annonce convainc mais la landing déçoit — vérifier la cohérence"}
        />
        <DiagCard
          label="Ratio CTR/CVR"
          value={avgRatio.toFixed(0)}
          status={avgRatio >= 300 ? 'ok' : avgRatio >= 150 ? 'warning' : 'critical'}
          detail="CVR / CTR × 100"
          action={avgRatio >= 300 ? 'Bonne cohérence annonce → landing' : avgRatio >= 150 ? 'Décalage modéré entre annonce et landing page' : 'Décalage fort entre la promesse et la landing page'}
        />
        <DiagCard
          label="ROAS statique vs vidéo"
          value={`${roasComparison.staticRoas.toFixed(2)}x`}
          status={!roasComparison.hasVideo ? 'ok' : roasComparison.better ? 'ok' : 'warning'}
          detail={roasComparison.hasVideo ? `vs ${roasComparison.videoRoas.toFixed(2)}x vidéo` : 'Pas de créas vidéo actives'}
          action={!roasComparison.hasVideo ? 'Seul format actif' : roasComparison.better ? 'Le statique surperforme — bonne allocation' : 'La vidéo surperforme — réévaluer l\'allocation budget créatif'}
        />
      </div>

      {/* ── Level 2: Frequency vs CTR scatter ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Matrice Fréquence vs CTR</h3>
          <p className="text-xs text-gray-500 mt-0.5">Taille = spend · Couleur = signal · La fatigue se lit de gauche à droite</p>
        </div>
        {rows.length > 0 ? (
          <ResponsiveContainer width="100%" height={380}>
            <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              {/* Quadrant backgrounds: X = frequency, Y = CTR */}
              <ReferenceArea x1={0} x2={3} y1={1} y2={10} fill="#dcfce7" fillOpacity={0.3} />
              <ReferenceArea x1={3} x2={10} y1={1} y2={10} fill="#fef9c3" fillOpacity={0.3} />
              <ReferenceArea x1={0} x2={3} y1={0} y2={1} fill="#ffedd5" fillOpacity={0.3} />
              <ReferenceArea x1={3} x2={10} y1={0} y2={1} fill="#fee2e2" fillOpacity={0.3} />
              <XAxis
                type="number" dataKey="frequency" domain={[0, 'auto']}
                tickFormatter={(v: number) => v.toFixed(1)}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                label={{ value: 'Fréquence', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }}
              />
              <YAxis
                type="number" dataKey="ctr" domain={[0, 'auto']}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                label={{ value: 'CTR (%)', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
              />
              <ReferenceLine x={3} stroke="#d1d5db" strokeDasharray="4 4" />
              <ReferenceLine y={1} stroke="#d1d5db" strokeDasharray="4 4" />
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
        <div className="flex flex-wrap gap-4 mt-3 text-[10px]">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100" /> Fréq &lt; 3 + CTR &gt; 1% : Fraîche &amp; performante</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-100" /> Fréq &gt; 3 + CTR &gt; 1% : Résiste à la fatigue</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-100" /> Fréq &lt; 3 + CTR &lt; 1% : Problème créatif</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100" /> Fréq &gt; 3 + CTR &lt; 1% : Fatigue confirmée</span>
        </div>
      </div>

      {/* ── Level 3: Enriched static table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Tableau créas statiques</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2 text-left font-medium">Créative</th>
                <th className="px-4 py-2 text-center font-medium">Format</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('ageDays')}>Âge{sortInd('ageDays')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('spend')}>Spend{sortInd('spend')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('ctr')}>CTR{sortInd('ctr')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('cvr')}>CVR{sortInd('cvr')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('ratioCtrCvr')}>
                  <span title="Un ratio élevé = bonne cohérence entre l'annonce et la landing page">Ratio{sortInd('ratioCtrCvr')}</span>
                </th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('frequency')}>Fréq.{sortInd('frequency')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('cpa')}>CPA{sortInd('cpa')}</th>
                <th className="px-4 py-2 text-right font-medium cursor-pointer select-none" onClick={() => handleSort('roas')}>ROAS{sortInd('roas')}</th>
                <th className="px-4 py-2 text-center font-medium">Signal</th>
                <th className="px-4 py-2 w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedRows.map((row) => {
                const interp = getInterpretation(row);
                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {row.thumbnailUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={row.thumbnailUrl} alt="" loading="lazy" className="w-8 h-8 rounded object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                            {row.format === 'SHOPPING' ? '🛒' : '🖼'}
                          </div>
                        )}
                        <span className="text-gray-800 truncate max-w-[140px]" title={row.name}>{row.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        row.format === 'SHOPPING' ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {row.format === 'SHOPPING' ? 'Shopping' : 'Statique'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">{row.ageDays}j</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{fmtCurrency(row.spend)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${ctrColor(row.ctr)}`}>{row.ctr.toFixed(2)}%</td>
                    <td className={`px-4 py-2 text-right font-mono ${cvrColor(row.cvr)}`}>{row.cvr > 0 ? `${row.cvr.toFixed(1)}%` : '—'}</td>
                    <td className={`px-4 py-2 text-right font-mono ${ratioColor(row.ratioCtrCvr)}`}>
                      <span title="Un ratio élevé = bonne cohérence entre l'annonce et la landing page">
                        {row.ratioCtrCvr > 0 ? row.ratioCtrCvr.toFixed(0) : '—'}
                      </span>
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${freqColor(row.frequency)}`}>{row.frequency.toFixed(1)}</td>
                    <td className="px-4 py-2 text-right text-gray-700 font-mono">{row.cpa > 0 ? `${row.cpa.toFixed(2)}€` : '—'}</td>
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
          {rows.length} créa{rows.length > 1 ? 's' : ''} statique{rows.length > 1 ? 's' : ''} · Tri par défaut : CTR décroissant
        </div>
      </div>

      {/* ── Level 4: CTR evolution with creative selector ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="mb-3">
          <h3 className="font-semibold text-gray-900 text-sm">Évolution du CTR</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Sélectionne une créa pour l&apos;isoler · Seuil OK : &gt; 1% · Seuil critique : &lt; 0.5%
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

        {/* All creatives grid or selected creative detail */}
        {activeSelected === '__all__' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {rows.map((r) => {
              const interp = getInterpretation(r);
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedCreative(r.id)}
                  className="bg-white border border-gray-200 rounded-xl p-3 text-left hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnailUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-sm">{r.format === 'SHOPPING' ? '🛒' : '🖼'}</div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-gray-800 truncate" title={r.name}>{r.name}</p>
                      <p className="text-[10px] text-gray-400">{r.ageDays}j · {fmtCurrency(r.spend)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                    <div>
                      <span className="text-gray-400">CTR</span>
                      <span className={`ml-1 font-mono font-semibold ${ctrColor(r.ctr)}`}>{r.ctr.toFixed(2)}%</span>
                    </div>
                    <div>
                      <span className="text-gray-400">ROAS</span>
                      <span className={`ml-1 font-mono font-semibold ${roasColor(r.roas)}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : '—'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Fréq.</span>
                      <span className={`ml-1 font-mono font-semibold ${freqColor(r.frequency)}`}>{r.frequency.toFixed(1)}</span>
                    </div>
                    <div>{signalBadge(r.signal)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
            {rows.filter((r) => activeSelected === r.id).map((r) => {
              const interp = getInterpretation(r);
              return (
                <div key={r.id} className="flex gap-5 items-start">
                  {/* Thumbnail preview */}
                  <div className="shrink-0">
                    {r.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.thumbnailUrl} alt={r.name} className="w-28 h-28 rounded-xl object-cover border border-gray-200" />
                    ) : (
                      <div className="w-28 h-28 rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 text-2xl">{r.format === 'SHOPPING' ? '🛒' : '🖼'}</div>
                    )}
                    <p className="text-[10px] text-gray-500 mt-1.5 text-center truncate max-w-[112px]" title={r.name}>{r.name}</p>
                  </div>
                  {/* Metrics */}
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 uppercase">CTR</p>
                        <p className={`text-lg font-bold ${ctrColor(r.ctr)}`}>{r.ctr.toFixed(2)}%</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 uppercase">CVR</p>
                        <p className={`text-lg font-bold ${cvrColor(r.cvr)}`}>{r.cvr > 0 ? `${r.cvr.toFixed(1)}%` : '—'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 uppercase">Fréquence</p>
                        <p className={`text-lg font-bold ${freqColor(r.frequency)}`}>{r.frequency.toFixed(1)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 uppercase">ROAS</p>
                        <p className={`text-lg font-bold ${roasColor(r.roas)}`}>{r.roas > 0 ? `${r.roas.toFixed(2)}x` : '—'}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] text-gray-400 uppercase">Spend</p>
                        <p className="text-lg font-bold text-gray-900">{fmtCurrency(r.spend)}</p>
                      </div>
                    </div>
                    {/* CTR gauge */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 relative">
                        <div className="absolute h-2 bg-yellow-200 rounded-full" style={{ left: `${(0.5 / 3) * 100}%`, width: `${((1 - 0.5) / 3) * 100}%` }} />
                        <div className="absolute h-2 bg-green-200 rounded-l-none rounded-full" style={{ left: `${(1 / 3) * 100}%`, width: `${((3 - 1) / 3) * 100}%` }} />
                        <div className="absolute w-2 h-2 bg-blue-600 rounded-full top-0 -translate-x-1/2"
                          style={{ left: `${Math.min(100, (r.ctr / 3) * 100)}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">CTR {r.ctr.toFixed(2)}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {signalBadge(r.signal)}
                      <p className={`text-xs font-medium ${interp.color}`}>{interp.text}</p>
                    </div>
                  </div>
                </div>
              );
            })}
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
