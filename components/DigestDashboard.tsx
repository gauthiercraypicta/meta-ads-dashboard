'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { DigestData, ProcessedAdSet, CreaData, Severity } from '@/types/digest';
import { formatCurrency, formatROAS, formatPercent } from '@/lib/formatters';

// ─── Constants ────────────────────────────────────────────────────────────────
const BREAKEVEN = 2.22;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return formatCurrency(n); }
function fmtRoas(r: number) { return formatROAS(r); }

function fmtDelta(ratio: number): string {
  const sign = ratio >= 0 ? '+' : '';
  return `${sign}${(ratio * 100).toFixed(1)}%`;
}

function deltaTextColor(ratio: number, higherIsBetter = true): string {
  if (Math.abs(ratio) < 0.005) return 'text-gray-400';
  const good = higherIsBetter ? ratio > 0 : ratio < 0;
  return good ? 'text-emerald-600' : 'text-red-500';
}

// ─── Severity styling ─────────────────────────────────────────────────────────

const SEV: Record<Severity, {
  rowBg: string;
  badge: string;
  border: string;
  cardBg: string;
  dot: string;
  label: string;
}> = {
  red:    { rowBg: 'bg-red-50/60',    badge: 'bg-red-100 text-red-700',       border: 'border-red-400',    cardBg: 'bg-red-50',    dot: 'bg-red-500',    label: 'Critique' },
  orange: { rowBg: 'bg-orange-50/40', badge: 'bg-orange-100 text-orange-700', border: 'border-orange-400', cardBg: 'bg-orange-50', dot: 'bg-amber-400',  label: 'Vigilance' },
  green:  { rowBg: '',                badge: 'bg-emerald-100 text-emerald-700', border: 'border-emerald-400', cardBg: 'bg-emerald-50', dot: 'bg-emerald-500', label: 'OK' },
};

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconRefresh({ spin }: { spin?: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function IconChevron({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg className={`w-3.5 h-3.5 transition-transform ${dir === 'up' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ h = 'h-4', w = 'w-full', className = '' }: { h?: string; w?: string; className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${h} ${w} ${className}`} />;
}

// ─── Block 1 — Synthesis ─────────────────────────────────────────────────────

function SynthesisCard({ text, loading }: { text: string; loading: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <IconSpark />
        <h3 className="text-sm font-bold text-gray-800">Synthèse IA — 7 derniers jours</h3>
        <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded font-medium">claude-sonnet-4</span>
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton h="h-4" w="w-full" />
          <Skeleton h="h-4" w="w-5/6" />
          <Skeleton h="h-4" w="w-4/6" />
          <Skeleton h="h-4" w="w-3/4" />
        </div>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{text}</p>
      )}
    </div>
  );
}

// ─── Block 2 — Alert cards ───────────────────────────────────────────────────

function AlertCard({ adset }: { adset: ProcessedAdSet }) {
  const s = SEV[adset.severity];
  return (
    <div className={`flex-shrink-0 border-l-4 ${s.border} ${s.cardBg} rounded-r-xl px-4 py-3 min-w-[220px] max-w-[280px]`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
        <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${s.badge}`}>{s.label}</span>
      </div>
      <p className="text-xs font-semibold text-gray-900 truncate mb-1.5">{adset.adsetName}</p>
      <div className="flex items-center gap-3 text-xs mb-2">
        <span className="font-mono font-bold text-gray-800">{fmtRoas(adset.roas)}</span>
        <span className={`font-mono font-semibold ${deltaTextColor(adset.deltaRoas)}`}>
          ΔROAS {fmtDelta(adset.deltaRoas)}
        </span>
        <span className="text-gray-400">{fmt(adset.spend)}</span>
      </div>
      <p className="text-[11px] text-gray-600 leading-snug line-clamp-2">{adset.signal}</p>
    </div>
  );
}

function AlertsBlock({ adsets, loading }: { adsets: ProcessedAdSet[]; loading: boolean }) {
  const alerts = adsets.filter((a) => a.severity !== 'green');
  if (!loading && alerts.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Alertes · {loading ? '…' : `${alerts.length} ad set${alerts.length > 1 ? 's' : ''}`}
      </h3>
      {loading ? (
        <div className="flex gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 w-56 bg-gray-100 rounded-xl animate-pulse flex-shrink-0" />
          ))}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {alerts.sort((a) => a.severity === 'red' ? -1 : 1).map((a) => (
            <AlertCard key={a.adsetId} adset={a} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Block 3 — Ad sets table ─────────────────────────────────────────────────

type SortKey = 'spend' | 'roas' | 'cpa' | 'deltaRoas' | 'purchases';

function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function AdSetTable({
  adsets,
  loading,
  onSelect,
  selectedId,
}: {
  adsets: ProcessedAdSet[];
  loading: boolean;
  onSelect: (a: ProcessedAdSet) => void;
  selectedId: string | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...adsets].sort((a, b) => {
      const va = a[sortKey] as number;
      const vb = b[sortKey] as number;
      return sortAsc ? va - vb : vb - va;
    });
  }, [adsets, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }

  const thCls = (key: SortKey) =>
    `px-3 py-3 text-[10px] font-semibold uppercase tracking-wide cursor-pointer select-none text-right hover:text-blue-600 transition-colors whitespace-nowrap ${sortKey === key ? 'text-blue-600' : 'text-gray-400'}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-left text-gray-400 pl-4">Ad Set</th>
            <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-left text-gray-400 hidden md:table-cell">Campagne</th>
            <th className={thCls('spend')} onClick={() => handleSort('spend')}>
              <span className="flex items-center justify-end gap-1">Spend <IconChevron dir={sortKey === 'spend' && sortAsc ? 'up' : 'down'} /></span>
            </th>
            <th className={thCls('roas')} onClick={() => handleSort('roas')}>
              <span className="flex items-center justify-end gap-1">ROAS <IconChevron dir={sortKey === 'roas' && sortAsc ? 'up' : 'down'} /></span>
            </th>
            <th className={thCls('cpa')} onClick={() => handleSort('cpa')}>
              <span className="flex items-center justify-end gap-1">CPA <IconChevron dir={sortKey === 'cpa' && sortAsc ? 'up' : 'down'} /></span>
            </th>
            <th className={thCls('deltaRoas')} onClick={() => handleSort('deltaRoas')}>
              <span className="flex items-center justify-end gap-1">ΔROAS <IconChevron dir={sortKey === 'deltaRoas' && sortAsc ? 'up' : 'down'} /></span>
            </th>
            <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400 text-left">Signal</th>
            <th className="px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400 text-left">Sév.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {loading
            ? [...Array(6)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-3 py-3 pl-4"><Skeleton h="h-4" w="w-40" /></td>
                  <td className="px-3 py-3 hidden md:table-cell"><Skeleton h="h-4" w="w-28" /></td>
                  <td className="px-3 py-3"><Skeleton h="h-4" w="w-16" className="ml-auto" /></td>
                  <td className="px-3 py-3"><Skeleton h="h-4" w="w-12" className="ml-auto" /></td>
                  <td className="px-3 py-3"><Skeleton h="h-4" w="w-16" className="ml-auto" /></td>
                  <td className="px-3 py-3"><Skeleton h="h-4" w="w-12" className="ml-auto" /></td>
                  <td className="px-3 py-3"><Skeleton h="h-4" w="w-48" /></td>
                  <td className="px-3 py-3"><Skeleton h="h-5" w="w-16" /></td>
                </tr>
              ))
            : sorted.map((a) => {
                const s = SEV[a.severity];
                const isSelected = a.adsetId === selectedId;
                return (
                  <tr
                    key={a.adsetId}
                    className={`cursor-pointer transition-colors ${s.rowBg} ${isSelected ? 'ring-1 ring-inset ring-blue-400' : 'hover:bg-blue-50/30'}`}
                    onClick={() => onSelect(a)}
                  >
                    <td className="px-3 py-3 pl-4">
                      <p className="font-semibold text-gray-900 max-w-[200px] truncate">{a.adsetName}</p>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell">
                      <p className="text-xs text-gray-400 truncate max-w-[160px]">{a.campaignName}</p>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-800">{fmt(a.spend)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono font-bold ${a.roas >= BREAKEVEN ? 'text-emerald-600' : 'text-red-500'}`}>
                        {fmtRoas(a.roas)}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-700">{a.cpa > 0 ? fmt(a.cpa) : '—'}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`font-mono text-xs font-semibold ${deltaTextColor(a.deltaRoas)}`}>
                        {fmtDelta(a.deltaRoas)}
                      </span>
                    </td>
                    <td className="px-3 py-3 max-w-[240px]">
                      <p className="text-xs text-gray-600 truncate">{a.signal || '…'}</p>
                    </td>
                    <td className="px-3 py-3">
                      <SeverityBadge severity={a.severity} />
                    </td>
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && adsets.length === 0 && (
        <p className="text-sm text-gray-400 italic text-center py-8">Aucun ad set actif sur les 7 derniers jours.</p>
      )}
      {!loading && (
        <p className="text-[10px] text-gray-400 text-center py-2">
          Cliquer sur un ad set pour analyser ses créas →
        </p>
      )}
    </div>
  );
}

// ─── Block 4 — Crea drawer ────────────────────────────────────────────────────

function CreaThumbnail({ url, alt }: { url?: string; alt: string }) {
  if (!url) {
    return (
      <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
        <span className="text-[10px] text-gray-400">No img</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="w-20 h-20 object-cover rounded-lg flex-shrink-0 border border-gray-200" />
  );
}

function CreaPanel({
  adset,
  data,
  loading,
  onClose,
}: {
  adset: ProcessedAdSet | null;
  data: CreaData | null;
  loading: boolean;
  onClose: () => void;
}) {
  const open = Boolean(adset);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/25 z-30 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-[520px] bg-white shadow-2xl z-40 flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Focus créas</p>
            <p className="font-bold text-gray-900 truncate">{adset?.adsetName ?? '—'}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <IconClose />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-4">
              <div className="bg-indigo-50 rounded-xl p-4 space-y-2">
                <Skeleton h="h-4" w="w-full" />
                <Skeleton h="h-4" w="w-5/6" />
                <Skeleton h="h-4" w="w-4/5" />
              </div>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-3 border border-gray-100 rounded-xl p-3">
                  <div className="w-20 h-20 bg-gray-100 rounded-lg animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton h="h-3" w="w-3/4" />
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(4)].map((_, j) => <Skeleton key={j} h="h-8" />)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : data ? (
            <div className="p-5 space-y-4">
              {/* Claude analysis */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <IconSpark />
                  <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wide">Analyse IA</span>
                </div>
                <p className="text-sm text-indigo-900 leading-relaxed whitespace-pre-line">{data.analysis}</p>
              </div>

              {/* Ad list */}
              {data.ads.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-4">Aucune ad active sur la période.</p>
              ) : (
                <div className="space-y-3">
                  {data.ads.map((ad) => (
                    <div key={ad.adId} className="border border-gray-200 rounded-xl p-3 flex gap-3">
                      <CreaThumbnail url={ad.thumbnailUrl} alt={ad.adName} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-900 truncate mb-1">{ad.title || ad.adName}</p>
                        {ad.body && (
                          <p className="text-[11px] text-gray-500 line-clamp-2 mb-2">{ad.body}</p>
                        )}
                        <div className="grid grid-cols-4 gap-1.5 text-center">
                          {[
                            { label: 'Spend',  value: fmt(ad.spend) },
                            { label: 'ROAS',   value: fmtRoas(ad.roas), highlight: ad.roas >= BREAKEVEN },
                            { label: 'CPA',    value: ad.cpa > 0 ? fmt(ad.cpa) : '—' },
                            { label: 'CTR',    value: formatPercent(ad.ctr) },
                          ].map(({ label, value, highlight }) => (
                            <div key={label} className="bg-gray-50 rounded-lg px-1 py-1.5">
                              <p className="text-[9px] text-gray-400 uppercase font-semibold mb-0.5">{label}</p>
                              <p className={`text-xs font-bold font-mono ${highlight ? 'text-emerald-600' : 'text-gray-800'}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

// ─── Main DigestDashboard ─────────────────────────────────────────────────────

export default function DigestDashboard() {
  const [data,        setData]        = useState<DigestData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedAdset, setSelectedAdset] = useState<ProcessedAdSet | null>(null);
  const [creaData,    setCreaData]    = useState<CreaData | null>(null);
  const [creaLoading, setCreaLoading] = useState(false);

  // ── Main fetch ──────────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedAdset(null);
    setCreaData(null);
    try {
      const res = await fetch('/api/digest');
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json: DigestData = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Crea fetch (on demand) ─────────────────────────────────────────────────
  const fetchCrea = useCallback(async (adset: ProcessedAdSet) => {
    // Toggle off if same adset selected
    if (selectedAdset?.adsetId === adset.adsetId) {
      setSelectedAdset(null);
      setCreaData(null);
      return;
    }
    setSelectedAdset(adset);
    setCreaData(null);
    setCreaLoading(true);
    try {
      const params = new URLSearchParams({
        adsetId:   adset.adsetId,
        adsetName: adset.adsetName,
      });
      const res = await fetch(`/api/digest/crea?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CreaData = await res.json();
      setCreaData(json);
    } catch {
      setCreaData({
        adsetId:   adset.adsetId,
        adsetName: adset.adsetName,
        ads:       [],
        analysis:  'Impossible de charger l\'analyse créa.',
      });
    } finally {
      setCreaLoading(false);
    }
  }, [selectedAdset]);

  function closePanel() {
    setSelectedAdset(null);
    setCreaData(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Digest IA · 7 derniers jours vs semaine précédente</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading
              ? 'Chargement des données Meta + analyse Claude…'
              : lastUpdated
              ? `Mis à jour le ${lastUpdated.toLocaleDateString('fr-FR')} à ${lastUpdated.toLocaleTimeString('fr-FR')}`
              : 'Non chargé'}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          <IconRefresh spin={loading} />
          {loading ? 'Chargement…' : 'Rafraîchir'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="font-semibold">Erreur</p>
            <p className="text-red-600 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ── Block 1: Synthesis ── */}
      <SynthesisCard
        text={data?.synthesis ?? ''}
        loading={loading}
      />

      {/* ── Block 2: Alerts ── */}
      <AlertsBlock
        adsets={data?.adsets ?? []}
        loading={loading}
      />

      {/* ── Block 3: Table ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-800">
            Ad sets · {loading ? '…' : (data?.adsets.length ?? 0)} actifs sur 7 jours
          </h3>
          {!loading && data && (
            <div className="flex items-center gap-2 text-[10px]">
              {(['red', 'orange', 'green'] as Severity[]).map((sev) => {
                const count = data.adsets.filter((a) => a.severity === sev).length;
                if (count === 0) return null;
                return (
                  <span key={sev} className={`px-2 py-0.5 rounded-full font-bold ${SEV[sev].badge}`}>
                    {count} {SEV[sev].label.toLowerCase()}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <AdSetTable
          adsets={data?.adsets ?? []}
          loading={loading}
          onSelect={fetchCrea}
          selectedId={selectedAdset?.adsetId ?? null}
        />
      </div>

      {/* ── Block 4: Crea drawer ── */}
      <CreaPanel
        adset={selectedAdset}
        data={creaData}
        loading={creaLoading}
        onClose={closePanel}
      />
    </div>
  );
}
