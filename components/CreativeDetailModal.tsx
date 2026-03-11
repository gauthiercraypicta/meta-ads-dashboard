'use client';

import { useEffect } from 'react';
import {
  GroupedCreative,
  CreativeFormat,
  CreativeSignal,
} from '@/types/creative';

// ─── Badge configs (same as CreativesTable) ─────────────────────────────────
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

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  creative: GroupedCreative | null;
  onClose: () => void;
}

export default function CreativeDetailModal({ creative, onClose }: Props) {
  // Close on Escape key
  useEffect(() => {
    if (!creative) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [creative, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (creative) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [creative]);

  if (!creative) return null;

  const g = creative;
  const fmtCfg = FORMAT_CONFIG[g.format];
  const sigCfg = SIGNAL_CONFIG[g.signal];

  const totalImpressions = g.variants.reduce((s, v) => s + v.impressions, 0);
  const totalReach       = g.variants.reduce((s, v) => s + v.reach, 0);
  const totalClicks      = g.variants.reduce((s, v) => s + v.clicks, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transition-transform duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Close button ── */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Fermer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* ── Header ── */}
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-start gap-4">
            {/* Thumbnail (large) */}
            <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center">
              {g.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.thumbnailUrl}
                  alt={g.creativeName}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span className="text-gray-300 text-2xl">
                  {g.format === 'VIDEO' ? '▶' : g.format === 'SHOPPING' ? '🛒' : '🖼'}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900 truncate pr-8" title={g.rawName}>
                {g.creativeName || g.rawName}
              </h2>

              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {/* Format badge */}
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${fmtCfg.color}`}>
                  {fmtCfg.label}
                </span>
                {/* Signal badge */}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${sigCfg.bg} ${sigCfg.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${sigCfg.dot}`} />
                  {sigCfg.label}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500">
                <span>Campagne : <span className="font-medium text-gray-700">{g.campaign || '—'}</span></span>
                <span className="text-gray-300">|</span>
                <span>Âge : <span className="font-medium text-gray-700">{g.ageDays}j</span></span>
                <span className="text-gray-300">|</span>
                <span>Lancement : <span className="font-medium text-gray-700">{g.launchDate || '—'}</span></span>
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI row (4 cards) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
          {[
            { label: 'Dépenses', value: fmtCurrency(g.spend), color: 'text-gray-900' },
            { label: 'ROAS',     value: `${fmt(g.roas, 2)}x`,  color: roasColor(g.roas) },
            { label: 'CPA',      value: g.cpa > 0 ? `${fmt(g.cpa, 2)}€` : '—', color: 'text-gray-900' },
            { label: 'Achats',   value: g.purchases > 0 ? g.purchases.toString() : '—', color: 'text-gray-900' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 text-center">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* ── Performance metrics grid ── */}
        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Métriques de performance</h3>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              { label: 'CTR',         value: g.ctr > 0 ? `${fmt(g.ctr, 2)}%` : '—' },
              { label: 'CPM',         value: g.cpm > 0 ? `${fmt(g.cpm, 2)}€` : '—' },
              { label: 'Fréquence',   value: g.frequency > 0 ? fmt(g.frequency, 1) : '—', color: g.frequency > 0 ? freqColor(g.frequency) : undefined },
              { label: 'Impressions', value: totalImpressions > 0 ? totalImpressions.toLocaleString('fr-FR') : '—' },
              { label: 'Reach',       value: totalReach > 0 ? totalReach.toLocaleString('fr-FR') : '—' },
              { label: 'Clics',       value: totalClicks > 0 ? totalClicks.toLocaleString('fr-FR') : '—' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
                <p className={`text-sm font-semibold ${color || 'text-gray-700'}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ad Set breakdown table ── */}
        <div className="px-5 pb-5">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Détail par Ad Set ({g.variants.length})
          </h3>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide">Ad Set</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide">Statut</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">Spend</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">ROAS</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">CPA</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">CTR</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">CPM</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-400 uppercase tracking-wide">Fréq.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {g.variants.map((v) => {
                    const isActive = v.status === 'ACTIVE';
                    return (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-700 font-medium max-w-[180px]">
                          <span className="truncate block" title={v.adSetName}>
                            {v.adSetName || 'Ad set inconnu'}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                            isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {isActive ? 'Actif' : 'Pausé'}
                          </span>
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${v.spend > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                          {v.spend > 0 ? fmtCurrency(v.spend) : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${v.roas > 0 ? roasColor(v.roas) : 'text-gray-300'}`}>
                          {v.roas > 0 ? `${fmt(v.roas, 2)}x` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${v.cpa > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                          {v.cpa > 0 ? `${fmt(v.cpa, 2)}€` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${v.ctr > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                          {v.ctr > 0 ? `${fmt(v.ctr, 2)}%` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${v.cpm > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
                          {v.cpm > 0 ? `${fmt(v.cpm, 2)}€` : '—'}
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${v.frequency > 0 ? freqColor(v.frequency) : 'text-gray-300'}`}>
                          {v.frequency > 0 ? fmt(v.frequency, 1) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
