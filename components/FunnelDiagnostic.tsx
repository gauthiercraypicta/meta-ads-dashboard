'use client';

import { useMemo } from 'react';
import { formatCurrency } from '@/lib/formatters';
import { ProcessedAdSet, InsightData, ActionData } from '@/types/meta';

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = 'ok' | 'warning' | 'critical';

const STATUS_CONFIG: Record<Status, {
  badgeClass:  string;
  borderClass: string;
  dotClass:    string;
  label:       string;
}> = {
  ok:       { badgeClass: 'bg-green-100 text-green-700',  borderClass: 'border-green-200 bg-green-50/40',  dotClass: 'bg-green-500',  label: 'OK'        },
  warning:  { badgeClass: 'bg-amber-100 text-amber-700',  borderClass: 'border-amber-200 bg-amber-50/40',  dotClass: 'bg-amber-500',  label: 'Attention' },
  critical: { badgeClass: 'bg-red-100 text-red-700',      borderClass: 'border-red-200 bg-red-50/40',      dotClass: 'bg-red-500',    label: 'Critique'  },
};

// ─── Status helpers ───────────────────────────────────────────────────────────

function getCpmStatus(cpm: number): Status {
  if (cpm <= 0)  return 'warning';
  if (cpm < 8)   return 'ok';
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

function getFreqStatus(freq: number): Status {
  if (freq <= 0)  return 'ok'; // no data yet
  if (freq < 2.5) return 'ok';
  if (freq <= 4)  return 'warning';
  return 'critical';
}

function getRoasAlertStatus(roas: number): Status {
  if (roas <= 0)   return 'warning'; // no data
  if (roas > 2.22) return 'ok';
  if (roas >= 1.8) return 'warning';
  return 'critical';
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getActionValue(actions: ActionData[] | undefined, type: string): number {
  return parseFloat(actions?.find((a) => a.action_type === type)?.value ?? '0') || 0;
}

function getFirstConvValue(actions: ActionData[] | undefined, type: string): number {
  const entry = actions?.find((a) => a.action_type === type);
  if (!entry) return 0;
  return parseFloat(entry['7d_click_first_conversion'] ?? '0') || 0;
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

function IconRepeat() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconROI() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  cpm: number;
  ctr: number;
  cvr: number;
  onKpiClick?: (kpi: string) => void;
  adsets?:    ProcessedAdSet[];
  dailyData?: InsightData[] | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FunnelDiagnostic({ cpm, ctr, cvr, onKpiClick, adsets, dailyData }: Props) {

  // ── Card 4: Frequency data ────────────────────────────────────────────────

  const freqData = useMemo(() => {
    if (!adsets || adsets.length === 0) return { avg: 0, topOffenders: [] };
    const withFreq = adsets.filter((a) => a.frequency > 0);
    if (withFreq.length === 0) return { avg: 0, topOffenders: [] };
    const avg = withFreq.reduce((s, a) => s + a.frequency, 0) / withFreq.length;
    const topOffenders = [...withFreq]
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 3)
      .filter((a) => a.frequency >= 2.5);
    return { avg, topOffenders };
  }, [adsets]);

  // ── Card 5: ROAS alert data (7d click first conv., last 7 days) ───────────

  const roasAlertData = useMemo(() => {
    if (!dailyData || dailyData.length === 0) return { roas: 0, roi: 0, critiqueDays: 0 };
    const last7 = dailyData.slice(-7);

    let totalSpend        = 0;
    let totalFirstConvVal = 0;
    for (const d of last7) {
      totalSpend        += parseFloat(d.spend ?? '0') || 0;
      totalFirstConvVal += getFirstConvValue(d.action_values, 'purchase');
    }

    const roas = totalSpend > 0 ? totalFirstConvVal / totalSpend : 0;
    const roi  = (roas * 0.45 - 1) * 100;

    // Count consecutive days below 1.8x from most recent backwards
    let critiqueDays = 0;
    const sorted = [...last7].reverse();
    for (const d of sorted) {
      const spend   = parseFloat(d.spend ?? '0') || 0;
      const dayRoas = spend > 0
        ? getFirstConvValue(d.action_values, 'purchase') / spend
        : 0;
      if (spend > 0 && dayRoas < 1.8) critiqueDays++;
      else if (spend > 0) break; // streak broken on a day with real data
    }

    return { roas, roi, critiqueDays };
  }, [dailyData]);

  // ── Grid layout ───────────────────────────────────────────────────────────

  const showFreqCard = Boolean(adsets && adsets.length > 0);
  const showRoasCard = Boolean(dailyData && dailyData.length > 0);
  const totalCards   = 3 + (showFreqCard ? 1 : 0) + (showRoasCard ? 1 : 0);

  const gridClass =
    totalCards >= 5 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3'
    : totalCards === 4 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3'
    : 'grid-cols-1 sm:grid-cols-3 gap-3';

  // ── Base 3 cards config ───────────────────────────────────────────────────

  const baseBlocks = [
    {
      key: 'cpm' as const,
      label:       'CPM',
      sublabel:    'Audience',
      description: 'Coût pour mille impressions',
      value:       formatCurrency(cpm),
      status:      getCpmStatus(cpm),
      icon:        <IconAudience />,
      thresholds:  [
        { color: 'bg-green-400', label: '< $8 : OK' },
        { color: 'bg-amber-400', label: '$8–$15 : Attention' },
        { color: 'bg-red-400',   label: '> $15 : Critique' },
      ],
    },
    {
      key: 'ctr' as const,
      label:       'CTR',
      sublabel:    'Créatif',
      description: "Taux de clic sur l'annonce",
      value:       `${ctr.toFixed(2)}%`,
      status:      getCtrStatus(ctr),
      icon:        <IconCreative />,
      thresholds:  [
        { color: 'bg-green-400', label: '> 1% : OK' },
        { color: 'bg-amber-400', label: '0.5–1% : Attention' },
        { color: 'bg-red-400',   label: '< 0.5% : Critique' },
      ],
    },
    {
      key: 'cvr' as const,
      label:       'CVR',
      sublabel:    'Landing Page',
      description: 'Taux de conversion des clics',
      value:       `${cvr.toFixed(2)}%`,
      status:      getCvrStatus(cvr),
      icon:        <IconLanding />,
      thresholds:  [
        { color: 'bg-green-400', label: '> 3% : OK' },
        { color: 'bg-amber-400', label: '1–3% : Attention' },
        { color: 'bg-red-400',   label: '< 1% : Critique' },
      ],
    },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Diagnostic performance
      </h2>

      <div className={`grid ${gridClass}`}>

        {/* ── Cards 1–3: CPM / CTR / CVR (clickable) ── */}
        {baseBlocks.map((block) => {
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

              {/* Thresholds */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {block.thresholds.map((t) => (
                  <span key={t.label} className="flex items-center gap-1 text-[10px] text-gray-400">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.color}`} />
                    {t.label}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <p className="text-[10px] text-gray-300 mt-2.5 group-hover:text-blue-400 transition-colors">
                → Voir dans le graphique journalier
              </p>
            </button>
          );
        })}

        {/* ── Card 4: Fréquence par audience ── */}
        {showFreqCard && (() => {
          const { avg, topOffenders } = freqData;
          const status = getFreqStatus(avg);
          const s      = STATUS_CONFIG[status];
          return (
            <div className={`text-left w-full border rounded-xl px-4 py-3.5 ${s.borderClass}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.badgeClass}`}>
                    <IconRepeat />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">
                      Audience
                    </p>
                    <p className="text-xs font-bold text-gray-600 leading-tight mt-0.5">
                      Fréquence
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${s.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dotClass}`} />
                  {avg > 0 ? s.label : '—'}
                </span>
              </div>

              {/* Value */}
              <p className="text-2xl font-extrabold text-gray-900 mb-0.5">
                {avg > 0 ? avg.toFixed(2) : '—'}
              </p>
              <p className="text-[11px] text-gray-400 mb-3">Moy. d'expositions / utilisateur</p>

              {/* Thresholds */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                  &lt; 2.5 : OK
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400" />
                  2.5–4 : Attention
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-400" />
                  &gt; 4 : Critique
                </span>
              </div>

              {/* Top offenders */}
              {topOffenders.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1">
                  {topOffenders.map((a) => (
                    <span
                      key={a.id}
                      className="inline-flex items-center gap-1 text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded"
                    >
                      <span className="truncate max-w-[120px]">{a.name}</span>
                      · {a.frequency.toFixed(1)}×
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Card 5: Alerte ROAS ── */}
        {showRoasCard && (() => {
          const { roas, roi, critiqueDays } = roasAlertData;
          const status      = getRoasAlertStatus(roas);
          const s           = STATUS_CONFIG[status];
          const roiPositive = roi >= 0;

          return (
            <div className={`text-left w-full border rounded-xl px-4 py-3.5 ${s.borderClass}`}>
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.badgeClass}`}>
                    <IconROI />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">
                      ROI
                    </p>
                    <p className="text-xs font-bold text-gray-600 leading-tight mt-0.5">
                      ROAS 7j (1ère conv.)
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ${s.badgeClass}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dotClass}`} />
                  {roas > 0 ? s.label : '—'}
                </span>
              </div>

              {/* Value */}
              <p className="text-2xl font-extrabold text-gray-900 mb-0.5">
                {roas > 0 ? roas.toFixed(2) + 'x' : '—'}
              </p>
              <p className="text-[11px] text-gray-400 mb-1">
                7j clic first conv. · 7 derniers jours
              </p>

              {/* ROI% */}
              {roas > 0 && (
                <p className={`text-xs font-semibold mb-2.5 ${roiPositive ? 'text-green-600' : 'text-red-600'}`}>
                  ROI net ≈ {roiPositive ? '+' : ''}{roi.toFixed(1)}%
                  <span className="font-normal text-gray-400 ml-1">(marge 45%)</span>
                </p>
              )}

              {/* Thresholds */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-green-400" />
                  &gt; 2.22x : OK
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-amber-400" />
                  1.8–2.22x : Attention
                </span>
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-red-400" />
                  &lt; 1.8x : Critique
                </span>
              </div>

              {/* Critique streak */}
              {status === 'critical' && critiqueDays > 0 && (
                <p className="text-[10px] text-red-500 font-semibold mt-2.5">
                  ⚠ Critique depuis {critiqueDays} jour{critiqueDays > 1 ? 's' : ''}
                </p>
              )}
            </div>
          );
        })()}

      </div>
    </section>
  );
}
