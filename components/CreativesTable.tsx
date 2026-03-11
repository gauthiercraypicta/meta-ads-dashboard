'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AdData,
  ParsedCreative,
  GroupedCreative,
  CreativeFormat,
  CreativeSignal,
} from '@/types/creative';
import CreativesDiagnostic from './CreativesDiagnostic';
import CreativeHealthPanel from './CreativeHealthPanel';
import { IncrementalReachChart } from './charts';

// ─── Constants ────────────────────────────────────────────────────────────────
const PURCHASE_TYPES = [
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
  'purchase',
] as const;

// ─── Naming convention parser ─────────────────────────────────────────────────
// Format: YYMMDD_campaignTag_format_creativeName (- Copy N)
function parseAd(ad: AdData): Omit<ParsedCreative, 'signal'> {
  const rawName   = ad.name;
  const cleanName = rawName.replace(/\s*-\s*Copy\s*\d*$/i, '').trim();
  const parts     = cleanName.split('_');
  const isCopy    = /copy/i.test(rawName);

  let launchDate:      string              = '';
  let campaign:        string              = '';
  let creativeName:    string              = cleanName;
  let formatFromName:  CreativeFormat | null = null;

  if (parts.length >= 3) {
    if (/^\d{6}$/.test(parts[0])) {
      const d = parts[0];
      launchDate = `${d.slice(4, 6)}/${d.slice(2, 4)}/20${d.slice(0, 2)}`;
    }
    campaign = parts[1];
    const fmt = parts[2].toLowerCase();
    if      (fmt === 'video')                                                       formatFromName = 'VIDEO';
    else if (fmt === 'static')                                                      formatFromName = 'IMAGE';
    else if (fmt === 'shoppingfeed' || fmt === 'shopping' || fmt === 'dpa')        formatFromName = 'SHOPPING';
    creativeName = parts.length > 3 ? parts.slice(3).join(' ') : parts[2];
  }

  const objType  = ad.creative?.object_type?.toUpperCase() ?? '';
  const hasVideo = !!ad.creative?.video_id;
  let format: CreativeFormat =
    formatFromName ??
    (hasVideo || objType.includes('VIDEO')                          ? 'VIDEO'    :
     objType === 'DYNAMIC'                                          ? 'SHOPPING' :
     objType === 'IMAGE' || objType === 'LINK' || objType === 'SHARE' ? 'IMAGE'  :
     'UNKNOWN');

  if (rawName.toLowerCase().includes('shoppingfeed')) format = 'SHOPPING';

  const ageDays = Math.floor(
    (Date.now() - new Date(ad.created_time).getTime()) / 86_400_000,
  );

  const thumbnailUrl = ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null;

  const copyText = [ad.creative?.body ?? '', ad.creative?.title ?? ''].join(' ');
  const promoPatterns = [
    /\d+\s*%\s*(off|de\s+réduction|remise|rabais)/i,
    /-([\d]+)\s*€/,
    /code\s*(promo|réduction|remise)/i,
    /\bpromo\b/i,
    /\bsolde/i,
    /\bremise\b/i,
    /\bréduction\b/i,
    /économis/i,
    /\bdiscount\b/i,
    /\bsave\b/i,
    /[A-Z]{3,10}\d{1,3}\b/,
  ];
  const hasPromo = promoPatterns.some((p) => p.test(copyText));

  const insight     = ad.insights?.data?.[0];
  const spend       = parseFloat(insight?.spend       ?? '0');
  const ctr         = parseFloat(insight?.ctr         ?? '0');
  const cpm         = parseFloat(insight?.cpm         ?? '0');
  const freq        = parseFloat(insight?.frequency   ?? '0');
  const impressions = parseFloat(insight?.impressions ?? '0');
  const reach       = parseFloat(insight?.reach       ?? '0');
  const clicks      = parseFloat(insight?.clicks      ?? '0');

  const purchases = (() => {
    for (const t of PURCHASE_TYPES) {
      const a = (insight?.actions ?? []).find((x) => x.action_type === t);
      if (a) return parseFloat(a.value ?? '0');
    }
    return 0;
  })();

  const purchaseValue = (() => {
    for (const t of PURCHASE_TYPES) {
      const a = (insight?.action_values ?? []).find((x) => x.action_type === t);
      if (a) return parseFloat(a.value ?? '0');
    }
    return 0;
  })();

  const roas = (() => {
    for (const t of PURCHASE_TYPES) {
      const a = (insight?.purchase_roas ?? []).find((x) => x.action_type === t);
      if (a) return parseFloat(a.value ?? '0');
    }
    if (spend > 0 && purchaseValue > 0) return purchaseValue / spend;
    return 0;
  })();

  const cpa = purchases > 0 ? spend / purchases : 0;

  return {
    id:            ad.id,
    creativeId:    ad.creative?.id ?? '',
    rawName,
    creativeName,
    campaign,
    launchDate,
    ageDays,
    format,
    hasPromo,
    isCopy,
    status:        ad.status,
    thumbnailUrl,
    adSetId:       ad.adset_id    ?? '',
    adSetName:     ad.adset?.name ?? '',
    spend,
    roas,
    cpa,
    ctr,
    cpm,
    frequency:     freq,
    purchases,
    impressions,
    reach,
    clicks,
    purchaseValue,
  };
}

// ─── Signal logic ─────────────────────────────────────────────────────────────
function computeSignal({ spend, roas, frequency }: {
  spend: number; roas: number; frequency: number;
}): CreativeSignal {
  if (spend < 15)                                          return 'NEW';
  if (frequency > 4.5 || (roas < 1.0 && spend > 80))     return 'CUT';
  if (frequency > 3.0 && roas < 1.5)                      return 'FATIGUE';
  if (roas >= 2.5 && frequency <= 2.5)                    return 'SCALE';
  return 'WATCH';
}

// ─── Group creatives by creative.id ──────────────────────────────────────────
function groupCreatives(creatives: ParsedCreative[]): GroupedCreative[] {
  const map = new Map<string, ParsedCreative[]>();
  for (const c of creatives) {
    const key = c.creativeId || c.id; // fallback: one group per ad if no creative id
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(c);
  }

  const groups: GroupedCreative[] = [];
  for (const [creativeId, variants] of map) {
    // Canonical = oldest variant (most ageDays)
    const canonical = variants.reduce(
      (oldest, v) => (v.ageDays > oldest.ageDays ? v : oldest),
      variants[0],
    );

    const totalSpend         = variants.reduce((s, v) => s + v.spend,         0);
    const totalPurchases     = variants.reduce((s, v) => s + v.purchases,     0);
    const totalPurchaseValue = variants.reduce((s, v) => s + v.purchaseValue, 0);
    const totalImpressions   = variants.reduce((s, v) => s + v.impressions,   0);
    const totalReach         = variants.reduce((s, v) => s + v.reach,         0);
    const totalClicks        = variants.reduce((s, v) => s + v.clicks,        0);

    const roas      = totalSpend       > 0 ? totalPurchaseValue / totalSpend          : 0;
    const cpa       = totalPurchases   > 0 ? totalSpend         / totalPurchases      : 0;
    const ctr       = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100  : 0;
    const cpm       = totalImpressions > 0 ? (totalSpend  / totalImpressions) * 1000 : 0;
    // Impression-weighted average frequency
    const frequency = totalImpressions > 0
      ? variants.reduce((s, v) => s + v.frequency * v.impressions, 0) / totalImpressions
      : 0;

    const agg = { spend: totalSpend, roas, cpa, ctr, cpm, frequency, purchases: totalPurchases, reach: totalReach };

    groups.push({
      creativeId,
      rawName:      canonical.rawName,
      creativeName: canonical.creativeName,
      campaign:     canonical.campaign,
      launchDate:   canonical.launchDate,
      ageDays:      canonical.ageDays,
      format:       canonical.format,
      hasPromo:     canonical.hasPromo,
      isCopy:       canonical.isCopy,
      thumbnailUrl: canonical.thumbnailUrl,
      ...agg,
      signal:       computeSignal(agg),
      variants,
    });
  }
  return groups;
}

// ─── UI config ────────────────────────────────────────────────────────────────
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

// ─── Sort / Filter types ──────────────────────────────────────────────────────
type SortKey = 'spend' | 'roas' | 'cpa' | 'ctr' | 'cpm' | 'frequency' | 'ageDays' | 'purchases';
type SortDir = 'asc' | 'desc';
type FilterFormat = 'ALL' | CreativeFormat;
type FilterStatus = 'ALL' | 'ACTIVE' | 'PAUSED';
type FilterSignal = 'ALL' | CreativeSignal;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, decimals = 2): string { return n.toFixed(decimals); }
function fmtCurrency(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${n.toFixed(0)}€`;
}
function roasColor(v: number): string {
  if (v >= 3)   return 'text-green-600 font-bold';
  if (v >= 2)   return 'text-green-500';
  if (v >= 1.5) return 'text-yellow-600';
  if (v >= 1)   return 'text-orange-500';
  return 'text-red-500 font-bold';
}
function freqColor(v: number): string {
  if (v > 4.5) return 'text-red-600 font-bold';
  if (v > 3)   return 'text-orange-500 font-semibold';
  if (v > 2)   return 'text-yellow-600';
  return 'text-gray-700';
}

// ─── Th ───────────────────────────────────────────────────────────────────────
function Th({ label, sortKey, current, dir, onSort, right = false }: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; right?: boolean;
}) {
  const active = current === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wide cursor-pointer select-none whitespace-nowrap
        ${right ? 'text-right' : 'text-left'}
        ${active ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
    >
      {label}
      {active && <span className="ml-1 text-blue-400">{dir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  );
}

// ─── Small reusable cells ─────────────────────────────────────────────────────
function statusPill(status: string) {
  const isActive = status === 'ACTIVE';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${
      isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
      {isActive ? 'Actif' : 'Pausé'}
    </span>
  );
}

function signalPill(signal: CreativeSignal) {
  const cfg = SIGNAL_CONFIG[signal];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function metricTd(value: number, formatter: (n: number) => string, colorFn?: (n: number) => string) {
  return (
    <td className={`px-3 py-2.5 text-right text-xs whitespace-nowrap ${
      value > 0 ? (colorFn ? colorFn(value) : 'text-gray-700') : 'text-gray-300'
    }`}>
      {value > 0 ? formatter(value) : '—'}
    </td>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type DatePreset = 'last_7d' | 'last_30d' | 'last_90d';
interface Props { refreshKey?: number; datePreset?: DatePreset; }

export default function CreativesTable({ refreshKey = 0, datePreset = 'last_30d' }: Props) {
  const [rawAds, setRawAds]     = useState<AdData[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [sortKey, setSortKey]   = useState<SortKey>('spend');
  const [sortDir, setSortDir]   = useState<SortDir>('desc');
  const [filterFormat, setFilterFormat] = useState<FilterFormat>('ALL');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ACTIVE');
  const [filterSignal, setFilterSignal] = useState<FilterSignal>('ALL');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch(`/api/ads?date_preset=${datePreset}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRawAds(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Parse → group
  const grouped = useMemo((): GroupedCreative[] => {
    const parsed = rawAds.map((ad) => {
      const base = parseAd(ad);
      return { ...base, signal: computeSignal(base) };
    });
    return groupCreatives(parsed);
  }, [rawAds]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Filter
  const filtered = useMemo(() =>
    grouped.filter((g) => {
      if (filterFormat !== 'ALL' && g.format !== filterFormat) return false;
      if (filterSignal !== 'ALL' && g.signal !== filterSignal) return false;
      if (filterStatus !== 'ALL') {
        const hasActive = g.variants.some((v) => v.status === 'ACTIVE');
        const allPaused = g.variants.every((v) => v.status !== 'ACTIVE');
        if (filterStatus === 'ACTIVE' && !hasActive) return false;
        if (filterStatus === 'PAUSED' && !allPaused) return false;
      }
      return true;
    }),
  [grouped, filterFormat, filterStatus, filterSignal]);

  // Sort
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const va = a[sortKey] as number, vb = b[sortKey] as number;
      return sortDir === 'desc' ? vb - va : va - vb;
    }),
  [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Summary
  const summary = useMemo(() => {
    const active = grouped.filter((g) => g.variants.some((v) => v.status === 'ACTIVE'));
    const totalSpend = active.reduce((s, g) => s + g.spend, 0);
    const avgRoas    = active.length
      ? active.reduce((s, g) => s + g.roas, 0) / active.length
      : 0;
    return { active: active.length, totalSpend, avgRoas };
  }, [grouped]);

  // ── Loading / Error ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">Chargement des créatives…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
      </div>
    );
  }

  const COL_COUNT = 10;

  return (
    <div className="space-y-4">

      {/* ── Diagnostic créatives ── */}
      <CreativesDiagnostic grouped={grouped} />

      {/* ── Creative Health (churn · hit rate · reliance) ── */}
      <CreativeHealthPanel creatives={grouped} />

      {/* ── Couverture incrémentale ── */}
      <IncrementalReachChart creatives={grouped} />

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Créas actives',      value: summary.active.toString() },
          { label: 'Total dépensé',      value: fmtCurrency(summary.totalSpend) },
          { label: 'ROAS moy. actifs',   value: `${fmt(summary.avgRoas, 2)}x` },
          { label: 'Résultats affichés', value: sorted.length.toString() },
        ].map(({ label, value }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
            <p className="text-lg font-bold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-1">
          {(['ALL', 'VIDEO', 'IMAGE', 'SHOPPING'] as FilterFormat[]).map((f) => (
            <button key={f} onClick={() => setFilterFormat(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterFormat === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f === 'ALL' ? 'Tous formats' : FORMAT_CONFIG[f as CreativeFormat].label}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-1">
          {(['ALL', 'ACTIVE', 'PAUSED'] as FilterStatus[]).map((s) => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'ALL' ? 'Tous statuts' : s === 'ACTIVE' ? 'Actif' : 'Pausé'}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-1">
          <button onClick={() => setFilterSignal('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterSignal === 'ALL' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Tous signaux
          </button>
          {(['SCALE', 'WATCH', 'FATIGUE', 'CUT'] as CreativeSignal[]).map((s) => {
            const cfg = SIGNAL_CONFIG[s];
            return (
              <button key={s} onClick={() => setFilterSignal(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterSignal === s
                    ? `${cfg.bg} ${cfg.text} ring-1 ring-current`
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {cfg.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-60">
                  Créative
                </th>
                <Th label="Âge"   sortKey="ageDays"   current={sortKey} dir={sortDir} onSort={handleSort} right />
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-44">
                  Ad set
                </th>
                <Th label="Spend"  sortKey="spend"     current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="ROAS"   sortKey="roas"      current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="CPA"    sortKey="cpa"       current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="CTR"    sortKey="ctr"       current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="CPM"    sortKey="cpm"       current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="Fréq."  sortKey="frequency" current={sortKey} dir={sortDir} onSort={handleSort} right />
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                  Signal
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={COL_COUNT} className="px-4 py-10 text-center text-sm text-gray-400">
                    Aucune créative ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                sorted.flatMap((g) => {
                  const fmtCfg     = FORMAT_CONFIG[g.format];
                  const isExpanded = expanded.has(g.creativeId);
                  const isMulti    = g.variants.length > 1;
                  const activeCount = g.variants.filter((v) => v.status === 'ACTIVE').length;

                  const parentRow = (
                    <tr
                      key={`group-${g.creativeId}`}
                      className={`transition-colors ${
                        isMulti
                          ? 'cursor-pointer hover:bg-blue-50/50'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={isMulti ? () => toggleExpand(g.creativeId) : undefined}
                    >
                      {/* Créative */}
                      <td className="px-3 py-2.5 w-60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
                            {g.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={g.thumbnailUrl}
                                alt={g.creativeName}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <span className="text-gray-300 text-lg">
                                {g.format === 'VIDEO' ? '▶' : g.format === 'SHOPPING' ? '🛒' : '🖼'}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate max-w-[160px]" title={g.rawName}>
                              {g.creativeName || g.rawName}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">{g.campaign}</p>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${fmtCfg.color}`}>
                                {fmtCfg.label}
                              </span>
                              {g.hasPromo && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-700">
                                  Promo
                                </span>
                              )}
                              {g.isCopy && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                                  Copy
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Âge */}
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {g.ageDays}j
                      </td>

                      {/* Ad set */}
                      <td className="px-3 py-2.5 w-44">
                        {isMulti ? (
                          <div className="flex items-center gap-1.5 select-none">
                            <span
                              className="text-gray-400 text-[9px] inline-block transition-transform duration-150"
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                            >
                              ▶
                            </span>
                            <span className="text-[11px] text-blue-600 font-semibold">
                              {g.variants.length} ad sets
                            </span>
                            <span className="text-[10px] text-gray-400">
                              · {activeCount} actif{activeCount > 1 ? 's' : ''}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className="text-[11px] text-gray-600 truncate block max-w-[160px]"
                              title={g.variants[0].adSetName}
                            >
                              {g.variants[0].adSetName || '—'}
                            </span>
                            {statusPill(g.variants[0].status)}
                          </div>
                        )}
                      </td>

                      {/* Metrics */}
                      {metricTd(g.spend,     fmtCurrency)}
                      {metricTd(g.roas,      (n) => `${fmt(n, 2)}x`,  roasColor)}
                      {metricTd(g.cpa,       (n) => `${fmt(n, 2)}€`)}
                      {metricTd(g.ctr,       (n) => `${fmt(n, 2)}%`)}
                      {metricTd(g.cpm,       (n) => `${fmt(n, 2)}€`)}
                      {metricTd(g.frequency, (n) => fmt(n, 1),         freqColor)}

                      {/* Signal */}
                      <td className="px-3 py-2.5">{signalPill(g.signal)}</td>
                    </tr>
                  );

                  // Sub-rows when expanded
                  const subRows = isExpanded
                    ? g.variants.map((v, idx) => (
                        <tr
                          key={`variant-${v.id}`}
                          className={`bg-slate-50/80 border-l-2 border-blue-200 ${
                            idx === g.variants.length - 1 ? '' : 'border-b border-slate-100'
                          }`}
                        >
                          {/* Ad set name + indicator */}
                          <td className="px-3 py-2 w-60">
                            <div className="flex items-center gap-1.5 pl-11">
                              <span className="text-gray-300 text-xs shrink-0">└</span>
                              <span
                                className="text-xs font-medium text-gray-700 truncate max-w-[140px]"
                                title={v.adSetName}
                              >
                                {v.adSetName || 'Ad set inconnu'}
                              </span>
                            </div>
                          </td>

                          {/* Âge — blank */}
                          <td className="px-3 py-2 text-right text-xs text-gray-300">—</td>

                          {/* Status in ad set column */}
                          <td className="px-3 py-2 w-44">{statusPill(v.status)}</td>

                          {/* Variant metrics */}
                          {metricTd(v.spend,     fmtCurrency)}
                          {metricTd(v.roas,      (n) => `${fmt(n, 2)}x`,  roasColor)}
                          {metricTd(v.cpa,       (n) => `${fmt(n, 2)}€`)}
                          {metricTd(v.ctr,       (n) => `${fmt(n, 2)}%`)}
                          {metricTd(v.cpm,       (n) => `${fmt(n, 2)}€`)}
                          {metricTd(v.frequency, (n) => fmt(n, 1),         freqColor)}

                          {/* Variant signal */}
                          <td className="px-3 py-2">{signalPill(v.signal)}</td>
                        </tr>
                      ))
                    : [];

                  return [parentRow, ...subRows];
                })
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            {sorted.length} créative{sorted.length > 1 ? 's' : ''}
            {' · '}
            {sorted.reduce((s, g) => s + g.variants.length, 0)} ads au total
            {sorted.some((g) => g.variants.length > 1) && ' · Cliquer sur une ligne multi-ad sets pour développer'}
          </div>
        )}
      </div>
    </div>
  );
}
