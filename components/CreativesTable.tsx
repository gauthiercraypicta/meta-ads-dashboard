'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AdData, ParsedCreative, CreativeFormat, CreativeSignal } from '@/types/creative';

// ─── Naming convention parser ────────────────────────────────────────────────
// Format: YYMMDD_campaignTag_format_creativeName (- Copy N)
function parseAd(ad: AdData): Omit<ParsedCreative, 'signal'> {
  const rawName    = ad.name;
  const cleanName  = rawName.replace(/\s*-\s*Copy\s*\d*$/i, '').trim();
  const parts      = cleanName.split('_');
  const isCopy     = /copy/i.test(rawName);

  let launchDate   = '';
  let campaign     = '';
  let creativeName = cleanName;
  let formatFromName: CreativeFormat | null = null;

  if (parts.length >= 3) {
    // Token 0 — date YYMMDD
    if (/^\d{6}$/.test(parts[0])) {
      const d = parts[0];
      launchDate = `${d.slice(4, 6)}/${d.slice(2, 4)}/20${d.slice(0, 2)}`;
    }
    // Token 1 — campaign
    campaign = parts[1];

    // Token 2 — format
    const fmt = parts[2].toLowerCase();
    if (fmt === 'video')                              formatFromName = 'VIDEO';
    else if (fmt === 'static')                        formatFromName = 'IMAGE';
    else if (fmt === 'shoppingfeed' || fmt === 'shopping' || fmt === 'dpa') formatFromName = 'SHOPPING';

    // Token 3+ — creative name
    creativeName = parts.length > 3 ? parts.slice(3).join(' ') : parts[2];
  }

  // Format fallback from creative object_type / video_id
  const objType = ad.creative?.object_type?.toUpperCase() ?? '';
  const hasVideo = !!ad.creative?.video_id;
  let format: CreativeFormat =
    formatFromName ??
    (hasVideo || objType.includes('VIDEO')   ? 'VIDEO'    :
     objType === 'DYNAMIC'                   ? 'SHOPPING' :
     objType === 'IMAGE' || objType === 'LINK' || objType === 'SHARE' ? 'IMAGE' :
     'UNKNOWN');

  // Special case: shoppingfeed in name overrides everything
  if (rawName.toLowerCase().includes('shoppingfeed')) format = 'SHOPPING';

  // Age in days
  const ageDays = Math.floor(
    (Date.now() - new Date(ad.created_time).getTime()) / 86_400_000,
  );

  // Thumbnail
  const thumbnailUrl = ad.creative?.thumbnail_url ?? ad.creative?.image_url ?? null;

  // ─── Promo detection from copy ──────────────────────────────────────────
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
    /[A-Z]{3,10}\d{1,3}\b/,  // promo codes like SAVE10, CODE20
  ];
  const hasPromo = promoPatterns.some((p) => p.test(copyText));

  // ─── Metrics from insights ──────────────────────────────────────────────
  const insight = ad.insights?.data?.[0];
  const spend   = parseFloat(insight?.spend ?? '0');
  const ctr     = parseFloat(insight?.ctr ?? '0');
  const cpm     = parseFloat(insight?.cpm ?? '0');
  const freq    = parseFloat(insight?.frequency ?? '0');

  const PURCHASE_TYPES = [
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
    'purchase',
  ];

  const purchases = (() => {
    const actions = insight?.actions ?? [];
    for (const t of PURCHASE_TYPES) {
      const a = actions.find((x) => x.action_type === t);
      if (a) return parseFloat(a.value ?? '0');
    }
    return 0;
  })();

  const roas = (() => {
    const r = insight?.purchase_roas ?? [];
    for (const t of PURCHASE_TYPES) {
      const a = r.find((x) => x.action_type === t);
      if (a) return parseFloat(a.value ?? '0');
    }
    // fallback: action_values / spend
    const av = insight?.action_values ?? [];
    for (const t of PURCHASE_TYPES) {
      const a = av.find((x) => x.action_type === t);
      if (a && spend > 0) return parseFloat(a.value ?? '0') / spend;
    }
    return 0;
  })();

  const cpa = purchases > 0 ? spend / purchases : 0;

  return {
    id: ad.id,
    rawName,
    creativeName,
    campaign,
    launchDate,
    ageDays,
    format,
    hasPromo,
    isCopy,
    status: ad.status,
    thumbnailUrl,
    spend,
    roas,
    cpa,
    ctr,
    cpm,
    frequency: freq,
    purchases,
  };
}

// ─── Signal logic ─────────────────────────────────────────────────────────────
function computeSignal(c: Omit<ParsedCreative, 'signal'>): CreativeSignal {
  if (c.spend < 15)                                       return 'NEW';
  if (c.frequency > 4.5 || (c.roas < 1.0 && c.spend > 80)) return 'CUT';
  if (c.frequency > 3.0 && c.roas < 1.5)                 return 'FATIGUE';
  if (c.roas >= 2.5 && c.frequency <= 2.5)               return 'SCALE';
  if (c.frequency > 3.0 || (c.roas >= 1.0 && c.roas < 1.8)) return 'WATCH';
  return 'WATCH';
}

// ─── Signal UI config ─────────────────────────────────────────────────────────
const SIGNAL_CONFIG: Record<CreativeSignal, { label: string; bg: string; text: string; dot: string }> = {
  SCALE:   { label: 'Scaler',   bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  WATCH:   { label: 'Surveiller', bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500' },
  FATIGUE: { label: 'Fatigue',  bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  CUT:     { label: 'Couper',   bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  NEW:     { label: 'Nouveau',  bg: 'bg-gray-100',   text: 'text-gray-500',   dot: 'bg-gray-400'   },
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
function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}
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
  if (v > 4.5)  return 'text-red-600 font-bold';
  if (v > 3)    return 'text-orange-500 font-semibold';
  if (v > 2)    return 'text-yellow-600';
  return 'text-gray-700';
}

// ─── Th component ─────────────────────────────────────────────────────────────
function Th({
  label, sortKey, current, dir, onSort, right = false,
}: {
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
      {active && (
        <span className="ml-1 text-blue-400">{dir === 'desc' ? '↓' : '↑'}</span>
      )}
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type DatePreset = 'last_7d' | 'last_30d' | 'last_90d';

interface Props {
  refreshKey?: number;
  datePreset?: DatePreset;
}

export default function CreativesTable({ refreshKey = 0, datePreset = 'last_30d' }: Props) {
  const [rawAds, setRawAds]         = useState<AdData[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [sortKey, setSortKey]       = useState<SortKey>('spend');
  const [sortDir, setSortDir]       = useState<SortDir>('desc');
  const [filterFormat, setFilterFormat] = useState<FilterFormat>('ALL');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ACTIVE');
  const [filterSignal, setFilterSignal] = useState<FilterSignal>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  // Parse + enrich all ads
  const creatives = useMemo((): ParsedCreative[] =>
    rawAds.map((ad) => {
      const base = parseAd(ad);
      return { ...base, signal: computeSignal(base) };
    }),
  [rawAds]);

  // Filter
  const filtered = useMemo(() =>
    creatives.filter((c) => {
      if (filterFormat !== 'ALL' && c.format !== filterFormat)   return false;
      if (filterStatus !== 'ALL' && c.status !== filterStatus)   return false;
      if (filterSignal !== 'ALL' && c.signal !== filterSignal)   return false;
      return true;
    }),
  [creatives, filterFormat, filterStatus, filterSignal]);

  // Sort
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortDir === 'desc' ? vb - va : va - vb;
    }),
  [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Summary stats
  const summary = useMemo(() => {
    const active = creatives.filter((c) => c.status === 'ACTIVE');
    const totalSpend = active.reduce((s, c) => s + c.spend, 0);
    const avgRoas    = active.length
      ? active.reduce((s, c) => s + c.roas, 0) / active.length
      : 0;
    return { active: active.length, totalSpend, avgRoas };
  }, [creatives]);

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

  return (
    <div className="space-y-4">

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Créas actives',    value: summary.active.toString() },
          { label: 'Total dépensé',    value: fmtCurrency(summary.totalSpend) },
          { label: 'ROAS moy. actifs', value: `${fmt(summary.avgRoas, 2)}x` },
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
        {/* Format */}
        <div className="flex items-center gap-1">
          {(['ALL', 'VIDEO', 'IMAGE', 'SHOPPING'] as FilterFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilterFormat(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterFormat === f
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f === 'ALL' ? 'Tous formats' : FORMAT_CONFIG[f as CreativeFormat].label}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Status */}
        <div className="flex items-center gap-1">
          {(['ALL', 'ACTIVE', 'PAUSED'] as FilterStatus[]).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                filterStatus === s
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'ALL' ? 'Tous statuts' : s === 'ACTIVE' ? 'Actif' : 'Pausé'}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-gray-200" />

        {/* Signal */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setFilterSignal('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filterSignal === 'ALL'
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Tous signaux
          </button>
          {(['SCALE', 'WATCH', 'FATIGUE', 'CUT'] as CreativeSignal[]).map((s) => {
            const cfg = SIGNAL_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilterSignal(s)}
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
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 w-72">
                  Créative
                </th>
                <Th label="Âge"     sortKey="ageDays"   current={sortKey} dir={sortDir} onSort={handleSort} right />
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Statut</th>
                <Th label="Spend"   sortKey="spend"     current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="ROAS"    sortKey="roas"      current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="CPA"     sortKey="cpa"       current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="CTR"     sortKey="ctr"       current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="CPM"     sortKey="cpm"       current={sortKey} dir={sortDir} onSort={handleSort} right />
                <Th label="Fréq."   sortKey="frequency" current={sortKey} dir={sortDir} onSort={handleSort} right />
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-gray-400">
                    Aucune créative ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                sorted.map((c) => {
                  const fmtCfg = FORMAT_CONFIG[c.format];
                  const sigCfg = SIGNAL_CONFIG[c.signal];
                  return (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">

                      {/* Créative cell */}
                      <td className="px-3 py-2.5 w-72">
                        <div className="flex items-center gap-2.5">
                          {/* Thumbnail */}
                          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
                            {c.thumbnailUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={c.thumbnailUrl}
                                alt={c.creativeName}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span className="text-gray-300 text-lg">
                                {c.format === 'VIDEO' ? '▶' : c.format === 'SHOPPING' ? '🛒' : '🖼'}
                              </span>
                            )}
                          </div>

                          {/* Name + tags */}
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-gray-900 truncate max-w-[180px]" title={c.rawName}>
                              {c.creativeName || c.rawName}
                            </p>
                            <p className="text-[10px] text-gray-400 truncate">{c.campaign}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${fmtCfg.color}`}>
                                {fmtCfg.label}
                              </span>
                              {c.hasPromo && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-700">
                                  Promo
                                </span>
                              )}
                              {c.isCopy && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                                  Copy
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Age */}
                      <td className="px-3 py-2.5 text-right text-xs text-gray-600 whitespace-nowrap">
                        {c.ageDays}j
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          c.status === 'ACTIVE'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${c.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {c.status === 'ACTIVE' ? 'Actif' : 'Pausé'}
                        </span>
                      </td>

                      {/* Spend */}
                      <td className="px-3 py-2.5 text-right text-xs font-medium text-gray-900 whitespace-nowrap">
                        {c.spend > 0 ? fmtCurrency(c.spend) : <span className="text-gray-300">—</span>}
                      </td>

                      {/* ROAS */}
                      <td className={`px-3 py-2.5 text-right text-xs whitespace-nowrap ${c.roas > 0 ? roasColor(c.roas) : 'text-gray-300'}`}>
                        {c.roas > 0 ? `${fmt(c.roas, 2)}x` : '—'}
                      </td>

                      {/* CPA */}
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                        {c.cpa > 0 ? `${fmt(c.cpa, 2)}€` : <span className="text-gray-300">—</span>}
                      </td>

                      {/* CTR */}
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                        {c.ctr > 0 ? `${fmt(c.ctr, 2)}%` : <span className="text-gray-300">—</span>}
                      </td>

                      {/* CPM */}
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700 whitespace-nowrap">
                        {c.cpm > 0 ? `${fmt(c.cpm, 2)}€` : <span className="text-gray-300">—</span>}
                      </td>

                      {/* Frequency */}
                      <td className={`px-3 py-2.5 text-right text-xs whitespace-nowrap ${c.frequency > 0 ? freqColor(c.frequency) : 'text-gray-300'}`}>
                        {c.frequency > 0 ? fmt(c.frequency, 1) : '—'}
                      </td>

                      {/* Signal */}
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold ${sigCfg.bg} ${sigCfg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sigCfg.dot}`} />
                          {sigCfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {sorted.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-100 text-xs text-gray-400">
            {sorted.length} créative{sorted.length > 1 ? 's' : ''} · Cliquer sur les colonnes pour trier
          </div>
        )}
      </div>
    </div>
  );
}
