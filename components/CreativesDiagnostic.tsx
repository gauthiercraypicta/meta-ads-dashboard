'use client';

import { useMemo } from 'react';
import { GroupedCreative, CreativeFormat } from '@/types/creative';

// ─── Types ────────────────────────────────────────────────────────────────────
type Status = 'ok' | 'warning' | 'critical';

const STATUS_CFG: Record<Status, {
  badge: string; border: string; dot: string; label: string; actionColor: string;
}> = {
  ok:       { badge: 'bg-green-100 text-green-700',  border: 'border-green-200 bg-green-50/50',  dot: 'bg-green-500',  label: 'OK',       actionColor: 'text-green-600' },
  warning:  { badge: 'bg-amber-100 text-amber-700',  border: 'border-amber-200 bg-amber-50/50',  dot: 'bg-amber-500',  label: 'Attention', actionColor: 'text-amber-600' },
  critical: { badge: 'bg-red-100 text-red-700',      border: 'border-red-200 bg-red-50/50',      dot: 'bg-red-500',    label: 'Critique',  actionColor: 'text-red-500'   },
};

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconRisk() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}
function IconRocket() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
function IconLeaf() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function IconTrophy() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}
function IconVideo() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtCurrency(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k€`;
  return `${n.toFixed(0)}€`;
}

const FORMAT_LABELS: Record<CreativeFormat, string> = {
  VIDEO:    'Vidéo',
  IMAGE:    'Statique',
  SHOPPING: 'Shopping',
  UNKNOWN:  'Autre',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  grouped: GroupedCreative[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function CreativesDiagnostic({ grouped }: Props) {

  // Always computed on ALL active grouped creatives, independent of table filters
  const activeGroups = useMemo(
    () => grouped.filter((g) => g.variants.some((v) => v.status === 'ACTIVE')),
    [grouped],
  );

  const totalSpend = useMemo(
    () => activeGroups.reduce((s, g) => s + g.spend, 0),
    [activeGroups],
  );

  // ── Card 1: Signaux critiques (% spend sur CUT/FATIGUE) ───────────────────
  const card1 = useMemo(() => {
    const risk        = activeGroups.filter((g) => g.signal === 'CUT' || g.signal === 'FATIGUE');
    const riskSpend   = risk.reduce((s, g) => s + g.spend, 0);
    const riskPct     = totalSpend > 0 ? (riskSpend / totalSpend) * 100 : 0;
    const cutCount    = risk.filter((g) => g.signal === 'CUT').length;
    const fatCount    = risk.filter((g) => g.signal === 'FATIGUE').length;
    const status: Status = riskPct > 40 ? 'critical' : riskPct > 20 ? 'warning' : 'ok';
    return { riskPct, riskSpend, cutCount, fatCount, status };
  }, [activeGroups, totalSpend]);

  // ── Card 2: Créas à scaler ────────────────────────────────────────────────
  const card2 = useMemo(() => {
    const scale         = activeGroups.filter((g) => g.signal === 'SCALE');
    const scaleSpend    = scale.reduce((s, g) => s + g.spend, 0);
    const scalePV       = scale.reduce((s, g) => s + g.roas * g.spend, 0);
    const avgRoas       = scaleSpend > 0 ? scalePV / scaleSpend : 0;
    const status: Status = scale.length >= 3 ? 'ok' : scale.length >= 1 ? 'warning' : 'critical';
    return { count: scale.length, scaleSpend, avgRoas, status };
  }, [activeGroups]);

  // ── Card 3: Fraîcheur du parc ─────────────────────────────────────────────
  const card3 = useMemo(() => {
    const old       = activeGroups.filter((g) => g.ageDays > 30);
    const oldSpend  = old.reduce((s, g) => s + g.spend, 0);
    const oldPct    = totalSpend > 0 ? (oldSpend / totalSpend) * 100 : 0;
    const fresh     = activeGroups.filter((g) => g.ageDays <= 15 && g.spend > 0);
    const freshSpend = fresh.reduce((s, g) => s + g.spend, 0);
    const status: Status = oldPct > 65 ? 'critical' : oldPct > 40 ? 'warning' : 'ok';
    return { oldPct, oldSpend, freshCount: fresh.length, freshSpend, status };
  }, [activeGroups, totalSpend]);

  // ── Card 4: Format gagnant ────────────────────────────────────────────────
  const card4 = useMemo(() => {
    const formats: CreativeFormat[] = ['VIDEO', 'IMAGE', 'SHOPPING'];
    const stats = formats
      .map((fmt) => {
        const gs     = activeGroups.filter((g) => g.format === fmt && g.spend > 0);
        const spend  = gs.reduce((s, g) => s + g.spend, 0);
        const pv     = gs.reduce((s, g) => s + g.roas * g.spend, 0);
        const roas   = spend > 0 ? pv / spend : 0;
        return { fmt, roas, spend, count: gs.length };
      })
      .filter((f) => f.count > 0)
      .sort((a, b) => b.roas - a.roas);

    if (stats.length === 0) return null;
    const winner = stats[0];
    const status: Status = winner.roas >= 2.5 ? 'ok' : winner.roas >= 1.5 ? 'warning' : 'critical';
    return { winner, others: stats.slice(1), status };
  }, [activeGroups]);

  // ── Card 5: Santé Vidéo ───────────────────────────────────────────────────
  const card5 = useMemo(() => {
    const videos = activeGroups.filter((g) => g.format === 'VIDEO' && g.spend > 0);
    if (videos.length === 0) return null;
    const totalSpendV = videos.reduce((s, g) => s + g.spend, 0);
    const totalImps   = videos.reduce((s, g) => s + g.impressions, 0);
    const totalV3s    = videos.reduce((s, g) => s + g.videoViews3s, 0);
    const totalThru   = videos.reduce((s, g) => s + g.thruplay, 0);
    const avgHook = totalImps > 0 ? (totalV3s / totalImps) * 100 : 0;
    const avgHold = totalV3s > 0 ? (totalThru / totalV3s) * 100 : 0;
    const status: Status = avgHook >= 30 ? 'ok' : avgHook >= 15 ? 'warning' : 'critical';
    return { avgHook, avgHold, count: videos.length, totalSpendV, status };
  }, [activeGroups]);

  if (activeGroups.length === 0) return null;

  // ── Cards data ─────────────────────────────────────────────────────────────
  const blocks = [
    {
      icon:       <IconRisk />,
      sublabel:   'Décision',
      label:      'Spend à risque',
      status:     card1.status,
      value:      `${card1.riskPct.toFixed(0)}%`,
      valueLabel: 'du spend actif',
      context:    card1.cutCount + card1.fatCount === 0
        ? 'Aucune créa en CUT ou FATIGUE'
        : `${card1.cutCount} à couper · ${card1.fatCount} en fatigue`,
      action: card1.riskSpend > 0
        ? `→ Stopper libère ~${fmtCurrency(card1.riskSpend)} de budget`
        : `→ Parc créatif sain, aucune coupe urgente`,
      thresholds: [
        { color: 'bg-green-400', label: '< 20% : OK' },
        { color: 'bg-amber-400', label: '20–40% : Attention' },
        { color: 'bg-red-400',   label: '> 40% : Critique' },
      ],
    },
    {
      icon:       <IconRocket />,
      sublabel:   'Opportunité',
      label:      'Créas à scaler',
      status:     card2.status,
      value:      `${card2.count}`,
      valueLabel: `créa${card2.count !== 1 ? 's' : ''} avec signal SCALE`,
      context: card2.count > 0
        ? `ROAS moy. ${card2.avgRoas.toFixed(2)}× · ${fmtCurrency(card2.scaleSpend)} investis`
        : 'Aucune créa ne répond aux critères SCALE',
      action: card2.count > 0
        ? `→ Augmenter le budget sur ces ${card2.count} créa${card2.count !== 1 ? 's' : ''}`
        : `→ Tester de nouvelles créas pour trouver un winner`,
      thresholds: [
        { color: 'bg-green-400', label: '≥ 3 créas : OK' },
        { color: 'bg-amber-400', label: '1–2 : Attention' },
        { color: 'bg-red-400',   label: '0 : Critique' },
      ],
    },
    {
      icon:       <IconLeaf />,
      sublabel:   'Renouvellement',
      label:      'Fraîcheur créas',
      status:     card3.status,
      value:      `${card3.oldPct.toFixed(0)}%`,
      valueLabel: 'du spend sur créas > 30j',
      context: card3.freshCount > 0
        ? `${card3.freshCount} créa${card3.freshCount !== 1 ? 's' : ''} fraîche${card3.freshCount !== 1 ? 's' : ''} ≤ 15j · ${fmtCurrency(card3.freshSpend)}`
        : 'Aucune créa fraîche (≤ 15j) en dépense',
      action: card3.freshCount < 2
        ? `→ Lancer de nouvelles créas en test rapidement`
        : `→ Bon équilibre : ${card3.freshCount} créas en phase de test`,
      thresholds: [
        { color: 'bg-green-400', label: '< 40% : OK' },
        { color: 'bg-amber-400', label: '40–65% : Attention' },
        { color: 'bg-red-400',   label: '> 65% : Critique' },
      ],
    },
    ...(card4 !== null
      ? [{
          icon:       <IconTrophy />,
          sublabel:   'Production',
          label:      'Format dominant',
          status:     card4.status,
          value:      `${card4.winner.roas.toFixed(2)}×`,
          valueLabel: `ROAS · ${FORMAT_LABELS[card4.winner.fmt]} · ${card4.winner.count} créas`,
          context: card4.others.length > 0
            ? card4.others.map((f) => `${FORMAT_LABELS[f.fmt]} ${f.roas.toFixed(2)}×`).join(' · ')
            : 'Seul format actif sur la période',
          action: `→ Concentrer la prod créa sur ${FORMAT_LABELS[card4.winner.fmt]}`,
          thresholds: [
            { color: 'bg-green-400', label: 'ROAS ≥ 2.5× : OK' },
            { color: 'bg-amber-400', label: '1.5–2.5× : Attention' },
            { color: 'bg-red-400',   label: '< 1.5× : Critique' },
          ],
        }]
      : []),
    ...(card5 !== null
      ? [{
          icon:       <IconVideo />,
          sublabel:   'Vidéo',
          label:      'Santé Vidéo',
          status:     card5.status,
          value:      `${card5.avgHook.toFixed(1)}%`,
          valueLabel: `Hook Rate moy. · ${card5.count} vidéo${card5.count > 1 ? 's' : ''}`,
          context:    `Hold Rate moy. ${card5.avgHold.toFixed(1)}% · ${fmtCurrency(card5.totalSpendV)} investis`,
          action: card5.avgHook >= 30
            ? '→ Vidéos performantes — maintenir le cap'
            : card5.avgHook >= 15
              ? '→ Hook moyen — retravailler les 3 premières secondes'
              : '→ Hook critique — les vidéos ne captent pas l\'attention',
          thresholds: [
            { color: 'bg-green-400', label: 'Hook ≥ 30% : OK' },
            { color: 'bg-amber-400', label: '15–30% : Attention' },
            { color: 'bg-red-400',   label: '< 15% : Critique' },
          ],
        }]
      : []),
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Diagnostic créatives
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {blocks.map((b, i) => {
          const s = STATUS_CFG[b.status];
          return (
            <div
              key={i}
              className={`border rounded-xl px-4 py-3.5 flex flex-col ${s.border}`}
            >
              {/* Header row */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${s.badge}`}>
                    {b.icon}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide leading-tight">
                      {b.sublabel}
                    </p>
                    <p className="text-xs font-bold text-gray-600 leading-tight mt-0.5">
                      {b.label}
                    </p>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold flex-shrink-0 ml-2 ${s.badge}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                  {s.label}
                </span>
              </div>

              {/* Big value */}
              <p className="text-2xl font-extrabold text-gray-900 leading-none mb-0.5">
                {b.value}
              </p>
              <p className="text-[11px] text-gray-500 mb-1">{b.valueLabel}</p>
              <p className="text-[11px] text-gray-400 mb-3 flex-1">{b.context}</p>

              {/* Threshold legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2.5">
                {b.thresholds.map((t) => (
                  <span key={t.label} className="flex items-center gap-1 text-[10px] text-gray-400">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.color}`} />
                    {t.label}
                  </span>
                ))}
              </div>

              {/* Recommended action */}
              <p className={`text-[11px] font-semibold leading-snug ${s.actionColor}`}>
                {b.action}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
