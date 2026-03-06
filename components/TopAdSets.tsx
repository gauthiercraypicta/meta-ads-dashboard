'use client';

import { ProcessedAdSet } from '@/types/meta';
import { formatCurrency, formatNumber, formatROAS } from '@/lib/formatters';

// ─── Constants ────────────────────────────────────────────────────────────────

const LEARNING_THRESHOLD = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roasColorClass(roas: number): string {
  if (roas >= 3)    return 'bg-green-100 text-green-700';
  if (roas >= 2.22) return 'bg-orange-100 text-orange-700';
  return 'bg-red-100 text-red-700';
}

function cpaColorClass(cpa: number, avg: number): string {
  if (avg <= 0 || cpa <= 0) return 'text-gray-700';
  const ratio = cpa / avg;
  if (ratio <= 0.9)  return 'text-green-600 font-semibold';
  if (ratio <= 1.15) return 'text-gray-700';
  return 'text-red-600 font-semibold';
}

function freqColorClass(freq: number): string {
  if (freq <= 0)   return 'text-gray-400';
  if (freq < 2.5)  return 'text-green-600';
  if (freq <= 4)   return 'text-orange-500';
  return 'text-red-600 font-semibold';
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  adsets: ProcessedAdSet[];
  avgCpa: number;
  adsets7dConversions: Map<string, number>;
  onViewAll: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TopAdSets({ adsets, avgCpa, adsets7dConversions, onViewAll }: Props) {
  const top5 = [...adsets]
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5);

  if (top5.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Top 5 Ad Sets — Dépenses
        </h2>
        <button
          onClick={onViewAll}
          className="text-xs text-blue-500 hover:text-blue-700 font-semibold transition-colors"
        >
          Voir tous les ad sets →
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/70">
              <th className="py-2.5 px-4 text-left   text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ad Set</th>
              <th className="py-2.5 px-4 text-left   text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Statut</th>
              <th className="py-2.5 px-4 text-right  text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Dépenses</th>
              <th className="py-2.5 px-4 text-right  text-[10px] font-semibold text-gray-400 uppercase tracking-wide">ROAS</th>
              <th className="py-2.5 px-4 text-right  text-[10px] font-semibold text-gray-400 uppercase tracking-wide">CPA</th>
              <th className="py-2.5 px-4 text-right  text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Conv.</th>
              <th className="py-2.5 px-4 text-right  text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Fréq.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {top5.map((a) => {
              const conv7d      = adsets7dConversions.get(a.id);
              const isLearning  = conv7d !== undefined && conv7d < LEARNING_THRESHOLD;
              const cpaDiff     = avgCpa > 0 && a.cpa > 0 ? ((a.cpa / avgCpa) * 100 - 100) : null;

              return (
                <tr key={a.id} className="hover:bg-gray-50/70 transition-colors">
                  {/* Name + Learning badge */}
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 max-w-[220px] truncate leading-tight">
                        {a.name}
                      </p>
                      {isLearning && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 flex-shrink-0 whitespace-nowrap">
                          ⚡ Learning
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="py-3 px-4">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      a.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {a.status === 'ACTIVE' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1 flex-shrink-0" />
                      )}
                      {a.status}
                    </span>
                  </td>

                  {/* Spend */}
                  <td className="py-3 px-4 text-right font-mono text-sm text-gray-800 font-medium">
                    {formatCurrency(a.spend)}
                  </td>

                  {/* ROAS */}
                  <td className="py-3 px-4 text-right">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold font-mono ${roasColorClass(a.roas)}`}>
                      {formatROAS(a.roas)}
                    </span>
                  </td>

                  {/* CPA */}
                  <td className={`py-3 px-4 text-right font-mono text-sm ${cpaColorClass(a.cpa, avgCpa)}`}>
                    {a.cpa > 0 ? formatCurrency(a.cpa) : '—'}
                    {cpaDiff !== null && (
                      <span className="block text-[10px] text-gray-400 font-normal">
                        {cpaDiff >= 0 ? '+' : ''}{cpaDiff.toFixed(0)}% moy.
                      </span>
                    )}
                  </td>

                  {/* Conv. */}
                  <td className="py-3 px-4 text-right font-mono text-sm text-gray-700">
                    {formatNumber(a.conversions)}
                  </td>

                  {/* Freq. */}
                  <td className={`py-3 px-4 text-right font-mono text-sm ${freqColorClass(a.frequency)}`}>
                    {a.frequency > 0 ? a.frequency.toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
