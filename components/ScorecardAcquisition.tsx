'use client';

import React from 'react';

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

// ── Status dot component ──
function StatusDot({ color }: { color: Status }) {
  const cls =
    color === 'green'  ? 'bg-emerald-400' :
    color === 'orange' ? 'bg-amber-400'   :
                         'bg-red-500';
  return <span className={`inline-block w-2 h-2 rounded-full ${cls} mr-1.5 flex-shrink-0`} />;
}

// ── Data ──
const columns: ScorecardColumn[] = [
  {
    title: 'Trafic',
    titleColor: 'text-yellow-400',
    borderColor: 'border-yellow-400/60',
    kpis: [
      { label: 'Sessions totales',     value: '185k  vs  200k',    statusColor: 'orange', statusLabel: 'Obj. -7,5%',    subtitle: '/mois' },
      { label: '% Paid vs Organic',    value: '62%  vs  38%',      statusColor: 'green',  statusLabel: 'Équilibré',      subtitle: '/mois' },
      { label: 'Nouveaux visiteurs',   value: '78%',               statusColor: 'green',  statusLabel: 'Obj. 75%',       subtitle: '/mois' },
      { label: 'Coût par session',     value: '0,42€  vs  0,35€',  statusColor: 'red',    statusLabel: 'Obj. +20%',      subtitle: '/mois' },
    ],
  },
  {
    title: 'Paid Media',
    titleColor: 'text-rose-400',
    borderColor: 'border-rose-400/60',
    kpis: [
      { label: 'Ad spend total',   value: '78k€  vs  85k€',     statusColor: 'green',  statusLabel: 'Budget -8%',  subtitle: '/mois' },
      { label: 'CPM moyen',        value: '8,20€  vs  7,50€',   statusColor: 'orange', statusLabel: 'Obj. +9%',    subtitle: '/mois' },
      { label: 'CTR moyen',        value: '1,8%  vs  2%',        statusColor: 'orange', statusLabel: 'Obj. -10%',   subtitle: '/mois' },
      { label: 'Thumbstop rate',   value: '32%  vs  30%',        statusColor: 'green',  statusLabel: 'Obj. +6%',    subtitle: '/mois' },
      { label: 'CPC moyen',        value: '0,58€  vs  0,50€',   statusColor: 'green',  statusLabel: 'Obj. +16%',   subtitle: '/mois' },
    ],
  },
  {
    title: 'Créa Production',
    titleColor: 'text-green-400',
    borderColor: 'border-green-400/60',
    kpis: [
      { label: 'Créas produites',  value: '45  vs  40',         statusColor: 'green',  statusLabel: 'Obj. +12%',   subtitle: '/mois' },
      { label: 'Créas testées',    value: '38  vs  35',         statusColor: 'green',  statusLabel: 'Obj. +8%',    subtitle: '/mois' },
      { label: 'Concept lancés',   value: '8  vs  10',          statusColor: 'red',    statusLabel: 'Obj. -20%',   subtitle: '/mois' },
      { label: 'Mix Static/Video/UGC', value: '12 / 18 / 15',  statusColor: 'green',  statusLabel: 'Diversifié',   subtitle: '/mois' },
      { label: 'Time to live',     value: '5J  vs  7J',         statusColor: 'red',    statusLabel: 'Obj. -28%',   subtitle: 'brief → live' },
    ],
  },
  {
    title: 'Créa Performance',
    titleColor: 'text-cyan-400',
    borderColor: 'border-cyan-400/60',
    kpis: [
      { label: 'Win rate',              value: '18%  vs  25%',    statusColor: 'red',    statusLabel: 'Obj. -28%',       subtitle: '/mois' },
      { label: 'Créas scalées (>1K€)',  value: '7  vs  10',       statusColor: 'red',    statusLabel: 'Obj. -30%',       subtitle: '/mois' },
      { label: 'Top créa % du spend',   value: '35%  vs  25%',    statusColor: 'red',    statusLabel: 'Concentration',   subtitle: '/mois' },
      { label: 'Hook rate moyen',       value: '28%  vs  30%',    statusColor: 'orange', statusLabel: 'Obj. -6%',        subtitle: '/mois' },
      { label: 'Créa fatigue',          value: '18J  vs  21J',    statusColor: 'orange', statusLabel: 'Obj. -7,5%',      subtitle: 'avant -30% perf' },
    ],
  },
  {
    title: 'Conversion',
    titleColor: 'text-orange-400',
    borderColor: 'border-orange-400/60',
    kpis: [
      { label: 'CVR site global',     value: '2,4%  vs  2,5%',    statusColor: 'orange', statusLabel: 'Obj. -4%',      subtitle: '/mois' },
      { label: 'CVR Meta / Google',   value: '2,1% / 3,2%',       statusColor: 'green',  statusLabel: 'Google +52%',   subtitle: '/mois' },
      { label: 'Taux ajout panier',   value: '8,5%  vs  9%',      statusColor: 'orange', statusLabel: 'Obj. -4%',      subtitle: '/mois' },
      { label: 'Abandon panier',      value: '72%  vs  68%',       statusColor: 'red',    statusLabel: 'Obj. +4%',      subtitle: '/mois' },
      { label: 'AOV',                 value: '68€  vs  65€',       statusColor: 'green',  statusLabel: 'Obj. +4,6%',    subtitle: '/mois' },
    ],
  },
  {
    title: 'Efficacité',
    titleColor: 'text-purple-400',
    borderColor: 'border-purple-400/60',
    kpis: [
      { label: 'CAC blended',          value: '28€  vs  25€',     statusColor: 'red',    statusLabel: 'Obj. +12%',    subtitle: '/mois' },
      { label: 'CAC paid',             value: '42€  vs  38€',     statusColor: 'orange', statusLabel: 'Obj. +10%',    subtitle: '/mois' },
      { label: 'ROAS blended',         value: '3.2x  vs  3.5x',   statusColor: 'orange', statusLabel: 'Obj. -8%',     subtitle: '/mois' },
      { label: 'MER',                  value: '4.1x  vs  4x',     statusColor: 'green',  statusLabel: 'Obj. +2,5%',   subtitle: '/mois' },
      { label: 'Contribution margin',  value: '22%  vs  25%',     statusColor: 'red',    statusLabel: 'Obj. -3pts',   subtitle: 'après ads' },
    ],
  },
];

// ── Main component ──
export default function ScorecardAcquisition() {
  return (
    <div className="min-h-screen bg-gray-950 rounded-2xl p-6 md:p-10">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-white">
          Scorecard <span className="italic text-blue-400">Acquisition</span>
        </h1>
        <p className="text-gray-400 mt-2 text-sm">E-commerce / D2C – Marque à 3M€/an</p>
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
      <div className="flex items-center gap-6 mt-8 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
          Objectif atteint
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
          À surveiller
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
          Action requise
        </span>
      </div>
    </div>
  );
}
