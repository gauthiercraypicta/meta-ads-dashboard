'use client';

import { formatCurrency } from '@/lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'ok' | 'warning' | 'critical';

const STATUS_CONFIG: Record<Status, {
  badgeClass: string;
  borderClass: string;
  dotClass: string;
  label: string;
}> = {
  ok:       { badgeClass: 'bg-green-100 text-green-700',  borderClass: 'border-green-200 bg-green-50/40',  dotClass: 'bg-green-500',  label: 'OK' },
  warning:  { badgeClass: 'bg-amber-100 text-amber-700',  borderClass: 'border-amber-200 bg-amber-50/40',  dotClass: 'bg-amber-500',  label: 'Attention' },
  critical: { badgeClass: 'bg-red-100 text-red-700',      borderClass: 'border-red-200 bg-red-50/40',      dotClass: 'bg-red-500',    label: 'Critique' },
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function getCpmStatus(cpm: number): Status {
  if (cpm <= 0) return 'warning';
  if (cpm < 8)  return 'ok';
  if (cpm <= 15) return 'warning';
  return 'critical';
}

function getCtrStatus(ctr: number): Status {
  if (ctr > 1)    return 'ok';
  if (ctr >= 0.5) return 'warning';
  return 'critical';
}

function getCvrStatus(cvr: number): Status {
  if (cvr > 3)  return 'ok';
  if (cvr >= 1) return 'warning';
  return 'critical';
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconAudience() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconCreative() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function IconLanding() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  cpm: number;
  ctr: number;
  cvr: number;
  onKpiClick?: (kpi: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FunnelDiagnostic({ cpm, ctr, cvr, onKpiClick }: Props) {
  const blocks = [
    {
      key: 'cpm' as const,
      label: 'CPM',
      sublabel: 'Audience',
      description: 'Coût pour mille impressions',
      value: formatCurrency(cpm),
      status: getCpmStatus(cpm),
      icon: <IconAudience />,
      thresholds: [
        { color: 'bg-green-400', label: '< $8 : OK' },
        { color: 'bg-amber-400', label: '$8–$15 : Attention' },
        { color: 'bg-red-400',   label: '> $15 : Critique' },
      ],
    },
    {
      key: 'ctr' as const,
      label: 'CTR',
      sublabel: 'Créatif',
      description: 'Taux de clic sur l\'annonce',
      value: `${ctr.toFixed(2)}%`,
      status: getCtrStatus(ctr),
      icon: <IconCreative />,
      thresholds: [
        { color: 'bg-green-400', label: '> 1% : OK' },
        { color: 'bg-amber-400', label: '0.5–1% : Attention' },
        { color: 'bg-red-400',   label: '< 0.5% : Critique' },
      ],
    },
    {
      key: 'cvr' as const,
      label: 'CVR',
      sublabel: 'Landing Page',
      description: 'Taux de conversion des clics',
      value: `${cvr.toFixed(2)}%`,
      status: getCvrStatus(cvr),
      icon: <IconLanding />,
      thresholds: [
        { color: 'bg-green-400', label: '> 3% : OK' },
        { color: 'bg-amber-400', label: '1–3% : Attention' },
        { color: 'bg-red-400',   label: '< 1% : Critique' },
      ],
    },
  ];

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Diagnostic performance
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {blocks.map((block) => {
          const s = STATUS_CONFIG[block.status];
          return (
            <button
              key={block.key}
              onClick={() => onKpiClick?.(block.key)}
              className={`group text-left w-full border rounded-xl px-4 py-3.5 transition-all hover:shadow-md cursor-pointer ${s.borderClass}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.badgeClass}`}>
                    {block.icon}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">
                      {block.sublabel}
                    </p>
                    <p className="text-xs font-bold text-gray-600 leading-tight mt-0.5">
                      {block.label}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${s.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dotClass}`} />
                  {s.label}
                </span>
              </div>

              {/* Value */}
              <p className="text-2xl font-extrabold text-gray-900 mb-0.5">{block.value}</p>
              <p className="text-[11px] text-gray-400 mb-3">{block.description}</p>

              {/* Thresholds legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {block.thresholds.map((t) => (
                  <span key={t.label} className="flex items-center gap-1 text-[10px] text-gray-400">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.color}`} />
                    {t.label}
                  </span>
                ))}
              </div>

              {/* CTA hint */}
              <p className="text-[10px] text-gray-300 mt-2.5 group-hover:text-blue-400 transition-colors">
                → Voir dans le graphique journalier
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
