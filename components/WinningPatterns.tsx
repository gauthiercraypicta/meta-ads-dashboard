'use client';

import { useMemo } from 'react';
import { GroupedCreative, CreativeFormat } from '@/types/creative';

// ─── Config ─────────────────────────────────────────────────────────────────
const FORMAT_LABELS: Record<CreativeFormat, string> = {
  VIDEO:    'Vidéo',
  IMAGE:    'Statique',
  SHOPPING: 'Shopping',
  UNKNOWN:  'Autre',
};

const FORMAT_COLORS: Record<CreativeFormat, string> = {
  VIDEO:    'bg-purple-400',
  IMAGE:    'bg-blue-400',
  SHOPPING: 'bg-teal-400',
  UNKNOWN:  'bg-gray-400',
};

// ─── Props ──────────────────────────────────────────────────────────────────
interface Props {
  grouped: GroupedCreative[];
}

export default function WinningPatterns({ grouped }: Props) {
  const scaleCreatives = useMemo(
    () => grouped.filter((g) => g.signal === 'SCALE' && g.variants.some((v) => v.status === 'ACTIVE')),
    [grouped],
  );

  // Card 1: Format dominant
  const formatCard = useMemo(() => {
    if (scaleCreatives.length < 3) return null;
    const counts: Record<CreativeFormat, number> = { VIDEO: 0, IMAGE: 0, SHOPPING: 0, UNKNOWN: 0 };
    for (const c of scaleCreatives) counts[c.format]++;
    const total = scaleCreatives.length;
    const sorted = (Object.entries(counts) as [CreativeFormat, number][])
      .filter(([, n]) => n > 0)
      .sort(([, a], [, b]) => b - a);
    const dominant = sorted[0];
    return {
      distribution: sorted.map(([fmt, n]) => ({ fmt, pct: (n / total) * 100 })),
      dominant: dominant[0],
      dominantPct: ((dominant[1] / total) * 100).toFixed(0),
    };
  }, [scaleCreatives]);

  // Card 2: Hit window (age distribution)
  const hitWindow = useMemo(() => {
    if (scaleCreatives.length < 3) return null;
    const ages = scaleCreatives.map((c) => c.ageDays).sort((a, b) => a - b);
    const q1 = ages[Math.floor(ages.length * 0.25)];
    const q3 = ages[Math.floor(ages.length * 0.75)];
    return { min: q1, max: q3 };
  }, [scaleCreatives]);

  // Card 3: Top ad sets
  const adSetCard = useMemo(() => {
    if (scaleCreatives.length < 3) return null;
    const adSetCounts = new Map<string, { name: string; count: number }>();
    for (const c of scaleCreatives) {
      for (const v of c.variants) {
        const name = v.adSetName || 'Inconnu';
        const prev = adSetCounts.get(name) ?? { name, count: 0 };
        prev.count++;
        adSetCounts.set(name, prev);
      }
    }
    const sorted = [...adSetCounts.values()].sort((a, b) => b.count - a.count);
    const top3 = sorted.slice(0, 3);
    const total = scaleCreatives.length;
    const topPct = total > 0 ? ((top3[0]?.count ?? 0) / total * 100).toFixed(0) : '0';
    return { top3, topPct, topName: top3[0]?.name ?? '—' };
  }, [scaleCreatives]);

  if (scaleCreatives.length < 3) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
        Patterns des créas SCALE
      </h2>
      <p className="text-[11px] text-gray-400 mb-3">
        Basé sur {scaleCreatives.length} créas avec signal SCALE
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* Card 1: Format dominant */}
        {formatCard && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Format dominant</p>
            {/* Stacked bar */}
            <div className="flex w-full h-3 rounded-full overflow-hidden mb-2">
              {formatCard.distribution.map(({ fmt, pct }) => (
                <div key={fmt} className={`${FORMAT_COLORS[fmt]}`} style={{ width: `${pct}%` }}
                  title={`${FORMAT_LABELS[fmt]}: ${pct.toFixed(0)}%`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {formatCard.distribution.map(({ fmt, pct }) => (
                <span key={fmt} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span className={`w-2 h-2 rounded-full ${FORMAT_COLORS[fmt]}`} />
                  {FORMAT_LABELS[fmt]} {pct.toFixed(0)}%
                </span>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-700">
              {formatCard.dominantPct}% de vos hits sont en {FORMAT_LABELS[formatCard.dominant]}
            </p>
          </div>
        )}

        {/* Card 2: Hit window */}
        {hitWindow && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Fenêtre de hit</p>
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 bg-gray-100 rounded-full h-2 relative">
                <div
                  className="absolute h-2 bg-green-400 rounded-full"
                  style={{
                    left: `${Math.min(100, (hitWindow.min / 75) * 100)}%`,
                    width: `${Math.min(100 - (hitWindow.min / 75) * 100, ((hitWindow.max - hitWindow.min) / 75) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-2">
              <span>j+0</span>
              <span>j+75</span>
            </div>
            <p className="text-xs font-semibold text-gray-700">
              Vos créas atteignent leur pic entre j+{hitWindow.min} et j+{hitWindow.max}
            </p>
          </div>
        )}

        {/* Card 3: Top ad sets */}
        {adSetCard && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Ad sets d&apos;origine des hits</p>
            <div className="space-y-1.5 mb-2">
              {adSetCard.top3.map((as, i) => (
                <div key={as.name} className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold ${
                    i === 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>{i + 1}</span>
                  <span className="text-[11px] text-gray-700 truncate flex-1" title={as.name}>{as.name}</span>
                  <span className="text-[10px] text-gray-400 font-mono">{as.count}</span>
                </div>
              ))}
            </div>
            <p className="text-xs font-semibold text-gray-700">
              {adSetCard.topPct}% de vos hits viennent de {adSetCard.topName.length > 20 ? adSetCard.topName.slice(0, 20) + '…' : adSetCard.topName}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
