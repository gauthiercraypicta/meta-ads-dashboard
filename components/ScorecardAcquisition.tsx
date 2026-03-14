'use client';

import React, { useState, useEffect, useMemo } from 'react';

// ── Types ──
type Status = 'green' | 'orange' | 'red';

interface KPI {
  label: string;
  value: string;
  statusColor: Status;
  statusLabel: string;
  subtitle?: string;
}

interface ScorecardColumn {
  title: string;
  titleColor: string;
  borderColor: string;
  kpis: KPI[];
}

interface ScorecardData {
  current: {
    spend: number; impressions: number; reach: number; clicks: number;
    ctr: number; cpc: number; cpm: number; frequency: number;
    conversions: number; conversionValue: number; roas: number; cpa: number;
  };
  previous: {
    spend: number; impressions: number; reach: number; clicks: number;
    ctr: number; cpc: number; cpm: number; frequency: number;
    conversions: number; conversionValue: number; roas: number; cpa: number;
  };
  creatives: {
    activeCount: number;
    totalAds: number;
    videoCount: number;
    staticCount: number;
    otherCount: number;
    avgAgeDays: number;
    winRate: number;
    topCreativeSpendPct: number;
    avgHookRate: number;
    avgHoldRate: number;
  };
  derived: {
    currCVR: number;
    prevCVR: number;
  };
}

// ── Helpers ──
function StatusDot({ color }: { color: Status }) {
  const cls =
    color === 'green'  ? 'bg-emerald-400' :
    color === 'orange' ? 'bg-amber-400'   :
                         'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-1.5 flex-shrink-0`} />;
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString('fr-FR');
}

function fmtCur(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k€`;
  return `${n.toFixed(2).replace('.', ',')}€`;
}

function fmtPct(n: number, decimals = 1): string {
  return `${n.toFixed(decimals).replace('.', ',')}%`;
}

function fmtRoas(n: number): string {
  return `${n.toFixed(2).replace('.', ',')}x`;
}

/** Build a comparison KPI with auto status color */
function cmpKpi(
  label: string,
  currStr: string,
  prevStr: string,
  curr: number,
  prev: number,
  higherIsBetter: boolean,
  subtitle: string,
): KPI {
  let statusLabel = '—';
  let statusColor: Status = 'orange';

  if (prev !== 0) {
    const d = ((curr - prev) / prev) * 100;
    const sign = d >= 0 ? '+' : '';
    statusLabel = `${sign}${d.toFixed(1).replace('.', ',')}%`;
    const improved = higherIsBetter ? d > 0 : d < 0;
    const nearFlat = Math.abs(d) < 5;
    statusColor = improved ? 'green' : nearFlat ? 'orange' : 'red';
  }

  return { label, value: `${currStr}  vs  ${prevStr}`, statusColor, statusLabel, subtitle };
}

function periodLabel(datePreset: string): string {
  switch (datePreset) {
    case 'last_7d':  return 'vs 7j précédents';
    case 'last_30d': return 'vs 30j précédents';
    case 'last_90d': return 'vs 90j précédents';
    default:         return 'vs période précédente';
  }
}

// ── Props ──
interface Props {
  datePreset?: string;
  refreshKey?: number;
}

// ── Main component ──
export default function ScorecardAcquisition({ datePreset = 'last_30d', refreshKey = 0 }: Props) {
  const [data, setData]       = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/scorecard?date_preset=${datePreset}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setData(null); }
        else setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [datePreset, refreshKey]);

  const columns: ScorecardColumn[] = useMemo(() => {
    if (!data) return [];
    const { current: c, previous: p, creatives: cr, derived } = data;
    const sub = periodLabel(datePreset);

    return [
      {
        title: 'Reach & Delivery',
        titleColor: 'text-yellow-400',
        borderColor: 'border-yellow-400/60',
        kpis: [
          cmpKpi('Impressions', fmtNum(c.impressions), fmtNum(p.impressions), c.impressions, p.impressions, true, sub),
          cmpKpi('Reach',       fmtNum(c.reach),       fmtNum(p.reach),       c.reach,       p.reach,       true, sub),
          cmpKpi('Clicks',      fmtNum(c.clicks),      fmtNum(p.clicks),      c.clicks,      p.clicks,      true, sub),
          cmpKpi('Frequency',   c.frequency.toFixed(2), p.frequency.toFixed(2), c.frequency,  p.frequency,   false, sub),
        ],
      },
      {
        title: 'Paid Media',
        titleColor: 'text-rose-400',
        borderColor: 'border-rose-400/60',
        kpis: [
          cmpKpi('Ad spend total', fmtCur(c.spend), fmtCur(p.spend), c.spend, p.spend, false, sub),
          cmpKpi('CPM moyen',      fmtCur(c.cpm),   fmtCur(p.cpm),   c.cpm,   p.cpm,   false, sub),
          cmpKpi('CTR moyen',      fmtPct(c.ctr),   fmtPct(p.ctr),   c.ctr,   p.ctr,   true,  sub),
          cmpKpi('CPC moyen',      fmtCur(c.cpc),   fmtCur(p.cpc),   c.cpc,   p.cpc,   false, sub),
        ],
      },
      {
        title: 'Créa Production',
        titleColor: 'text-green-400',
        borderColor: 'border-green-400/60',
        kpis: [
          {
            label: 'Créatives uniques',
            value: `${cr.activeCount}`,
            statusColor: (cr.activeCount > 10 ? 'green' : 'orange') as Status,
            statusLabel: `dans ${cr.totalAds} ads actives`,
            subtitle: 'dédupliquées par créa',
          },
          {
            label: 'Mix Static / Video',
            value: `${cr.staticCount} / ${cr.videoCount}${cr.otherCount > 0 ? ` / ${cr.otherCount}` : ''}`,
            statusColor: (cr.videoCount > 0 && cr.staticCount > 0 ? 'green' : 'orange') as Status,
            statusLabel: 'Diversification',
            subtitle: 'actives',
          },
          {
            label: 'Âge moyen des créas',
            value: `${cr.avgAgeDays}J`,
            statusColor: (cr.avgAgeDays > 30 ? 'red' : cr.avgAgeDays > 14 ? 'orange' : 'green') as Status,
            statusLabel: cr.avgAgeDays > 30 ? 'Créas vieillissantes' : cr.avgAgeDays > 14 ? 'À renouveler' : 'Créas fraîches',
            subtitle: 'depuis création',
          },
        ],
      },
      {
        title: 'Créa Performance',
        titleColor: 'text-cyan-400',
        borderColor: 'border-cyan-400/60',
        kpis: [
          {
            label: 'Win rate',
            value: fmtPct(cr.winRate),
            statusColor: (cr.winRate > 30 ? 'green' : cr.winRate > 15 ? 'orange' : 'red') as Status,
            statusLabel: `${Math.round(cr.winRate)}% > ROAS moyen`,
            subtitle: 'créas au-dessus du ROAS moyen',
          },
          {
            label: 'Top créa % du spend',
            value: fmtPct(cr.topCreativeSpendPct),
            statusColor: (cr.topCreativeSpendPct > 40 ? 'red' : cr.topCreativeSpendPct > 25 ? 'orange' : 'green') as Status,
            statusLabel: cr.topCreativeSpendPct > 40 ? 'Trop concentré' : cr.topCreativeSpendPct > 25 ? 'Concentration' : 'Bien réparti',
            subtitle: 'de la créa #1',
          },
          {
            label: 'Hook rate moyen',
            value: cr.avgHookRate > 0 ? fmtPct(cr.avgHookRate) : '—',
            statusColor: (cr.avgHookRate > 30 ? 'green' : cr.avgHookRate > 20 ? 'orange' : cr.avgHookRate > 0 ? 'red' : 'orange') as Status,
            statusLabel: cr.avgHookRate > 0 ? '3s views / impr.' : 'Pas de vidéo',
            subtitle: 'vidéos uniquement',
          },
          {
            label: 'Hold rate moyen',
            value: cr.avgHoldRate > 0 ? fmtPct(cr.avgHoldRate) : '—',
            statusColor: (cr.avgHoldRate > 20 ? 'green' : cr.avgHoldRate > 10 ? 'orange' : cr.avgHoldRate > 0 ? 'red' : 'orange') as Status,
            statusLabel: cr.avgHoldRate > 0 ? 'thruplay / 3s views' : 'Pas de vidéo',
            subtitle: 'vidéos uniquement',
          },
        ],
      },
      {
        title: 'Conversion',
        titleColor: 'text-orange-400',
        borderColor: 'border-orange-400/60',
        kpis: [
          cmpKpi('Conversions', fmtNum(c.conversions),      fmtNum(p.conversions),      c.conversions,      p.conversions,      true,  sub),
          cmpKpi('CVR',         fmtPct(derived.currCVR),     fmtPct(derived.prevCVR),     derived.currCVR,    derived.prevCVR,    true,  sub),
          cmpKpi('CPA',         fmtCur(c.cpa),               fmtCur(p.cpa),               c.cpa,              p.cpa,              false, sub),
          cmpKpi('Revenue',     fmtCur(c.conversionValue),   fmtCur(p.conversionValue),   c.conversionValue,  p.conversionValue,  true,  sub),
        ],
      },
      {
        title: 'Efficacité',
        titleColor: 'text-purple-400',
        borderColor: 'border-purple-400/60',
        kpis: [
          cmpKpi('ROAS',             fmtRoas(c.roas), fmtRoas(p.roas), c.roas, p.roas, true,  sub),
          cmpKpi('CPA',              fmtCur(c.cpa),   fmtCur(p.cpa),   c.cpa,  p.cpa,  false, sub),
          cmpKpi('Spend',            fmtCur(c.spend),  fmtCur(p.spend),  c.spend,  p.spend,  false, sub),
          cmpKpi('Revenue total',    fmtCur(c.conversionValue), fmtCur(p.conversionValue), c.conversionValue, p.conversionValue, true, sub),
        ],
      },
    ];
  }, [data, datePreset]);

  // ── Loading state ──
  if (loading) {
    return (
      <div className="min-h-[400px] bg-gray-950 rounded-2xl p-10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Chargement de la scorecard…</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !data) {
    return (
      <div className="min-h-[400px] bg-gray-950 rounded-2xl p-10 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">Erreur lors du chargement</p>
          <p className="text-gray-500 text-xs">{error ?? 'Données indisponibles'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-950 rounded-2xl p-6 md:p-10">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-white">
          Scorecard <span className="italic text-blue-400">Acquisition</span>
        </h1>
        <p className="text-gray-400 mt-2 text-sm">
          Données Meta Ads — {periodLabel(datePreset)}
        </p>
      </div>

      {/* Columns grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {columns.map((col) => (
          <div
            key={col.title}
            className="bg-gray-900/80 backdrop-blur border border-gray-700/50 rounded-2xl p-5 flex flex-col"
          >
            {/* Column title */}
            <div className="mb-4">
              <h2 className={`text-lg font-bold italic ${col.titleColor} text-center`}>
                {col.title}
              </h2>
              <div className={`border-b ${col.borderColor} mt-2`} />
            </div>

            {/* KPIs */}
            <div className="space-y-5 flex-1">
              {col.kpis.map((kpi) => (
                <div key={kpi.label}>
                  <p className="text-gray-400 text-xs mb-1">{kpi.label}</p>
                  <p className="text-white font-bold text-base leading-tight">{kpi.value}</p>
                  <div className="flex items-center mt-1">
                    <StatusDot color={kpi.statusColor} />
                    <span
                      className={`text-xs font-medium ${
                        kpi.statusColor === 'green'  ? 'text-emerald-400' :
                        kpi.statusColor === 'orange' ? 'text-amber-400'   :
                                                       'text-red-400'
                      }`}
                    >
                      {kpi.statusLabel}
                    </span>
                  </div>
                  {kpi.subtitle && (
                    <p className="text-gray-500 text-[10px] mt-0.5">{kpi.subtitle}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 mt-8 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          En amélioration
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
          Stable / À surveiller
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
          En déclin
        </span>
      </div>
    </div>
  );
}
