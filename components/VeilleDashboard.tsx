'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, Label,
} from 'recharts';
import type { VeilleData, BrandSummary, CopyAngle } from '@/types/veille';

// ─── Constants ────────────────────────────────────────────────────────────────

const ANGLE_LABELS: Record<CopyAngle, string> = {
  promotion:    'Promotion / Prix',
  lifestyle:    'Lifestyle / Émotion',
  product:      'Qualité produit',
  social_proof: 'Preuve sociale',
  urgency:      'Urgence',
  occasion:     'Occasion',
  other:        'Autre',
};

const ANGLE_COLORS: Record<CopyAngle, string> = {
  promotion:    '#F97316',
  lifestyle:    '#8B5CF6',
  product:      '#3B82F6',
  social_proof: '#10B981',
  urgency:      '#EF4444',
  occasion:     '#F59E0B',
  other:        '#9CA3AF',
};

const ANGLE_ORDER: CopyAngle[] = [
  'promotion', 'lifestyle', 'product', 'social_proof', 'urgency', 'occasion', 'other',
];

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW:      'Shop Now',
  ORDER_NOW:     'Order Now',
  GET_OFFER:     'Get Offer',
  LEARN_MORE:    'Learn More',
  SUBSCRIBE_NOW: 'Subscribe Now',
  SIGN_UP:       'Sign Up',
  TRY_NOW:       'Try Now',
  BOOK_NOW:      'Book Now',
  GET_STARTED:   'Get Started',
};

type SortKey = 'name' | 'activeAds' | 'avgAgeDays' | 'promotionPct' | 'emotionalPct';
type ViewMode = 'synthesis' | 'gaps' | 'positioning' | 'detail';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSpend(low: number, high: number): string {
  const fmt = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  if (low === 0 && high === 0) return '—';
  return `${fmt(low)}–${fmt(high)}`;
}

function topCta(ctas: Record<string, number>): string {
  const entries = Object.entries(ctas).sort(([, a], [, b]) => b - a);
  const key = entries[0]?.[0] ?? '';
  return CTA_LABELS[key] ?? key;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconRefresh({ spin }: { spin?: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function IconSort({ active }: { active: boolean }) {
  return (
    <svg className={`w-3 h-3 ${active ? 'text-blue-500' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function BrandDot({ color }: { color: string }) {
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 inline-block" style={{ backgroundColor: color }} />;
}

function AngleBadge({ angle }: { angle: CopyAngle }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: ANGLE_COLORS[angle] + '22', color: ANGLE_COLORS[angle] }}
    >
      {ANGLE_LABELS[angle]}
    </span>
  );
}

function MockBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Données simulées — En attente accès FB Ad Library API
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-extrabold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Horizontal bar ───────────────────────────────────────────────────────────

function HBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-36 text-right text-gray-600 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-6 text-right font-mono text-gray-700 flex-shrink-0">{count}</span>
    </div>
  );
}

// ─── Synthesis view ───────────────────────────────────────────────────────────

function SynthesisView({
  brands,
  onSelectBrand,
}: {
  brands: BrandSummary[];
  onSelectBrand: (id: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('activeAds');
  const [sortAsc, setSortAsc]  = useState(false);

  const sorted = useMemo(() => {
    return [...brands].sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      switch (sortKey) {
        case 'name':         va = a.brand.name; vb = b.brand.name; break;
        case 'activeAds':    va = a.activeAds;  vb = b.activeAds;  break;
        case 'avgAgeDays':   va = a.avgAgeDays; vb = b.avgAgeDays; break;
        case 'promotionPct': va = a.promotionPct; vb = b.promotionPct; break;
        case 'emotionalPct': va = a.emotionalPct; vb = b.emotionalPct; break;
        default: va = 0; vb = 0;
      }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [brands, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const thCls = (key: SortKey) =>
    `px-4 py-3 text-[10px] font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-blue-600 transition-colors ${sortKey === key ? 'text-blue-600' : 'text-gray-400'}`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className={`${thCls('name')} text-left pl-5`} onClick={() => handleSort('name')}>
              <span className="flex items-center gap-1.5">Marque <IconSort active={sortKey === 'name'} /></span>
            </th>
            <th className={`${thCls('activeAds')} text-right`} onClick={() => handleSort('activeAds')}>
              <span className="flex items-center justify-end gap-1.5">Ads actives <IconSort active={sortKey === 'activeAds'} /></span>
            </th>
            <th className={`${thCls('avgAgeDays')} text-right`} onClick={() => handleSort('avgAgeDays')}>
              <span className="flex items-center justify-end gap-1.5">Âge moy. <IconSort active={sortKey === 'avgAgeDays'} /></span>
            </th>
            <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left">Angle dominant</th>
            <th className={`${thCls('promotionPct')} text-right`} onClick={() => handleSort('promotionPct')}>
              <span className="flex items-center justify-end gap-1.5">% Promo <IconSort active={sortKey === 'promotionPct'} /></span>
            </th>
            <th className={`${thCls('emotionalPct')} text-right`} onClick={() => handleSort('emotionalPct')}>
              <span className="flex items-center justify-end gap-1.5">% Lifestyle <IconSort active={sortKey === 'emotionalPct'} /></span>
            </th>
            <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left">Top CTA</th>
            <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-right pr-5">Est. spend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((b) => (
            <tr
              key={b.brand.id}
              className="hover:bg-blue-50/40 cursor-pointer transition-colors"
              onClick={() => onSelectBrand(b.brand.id)}
            >
              <td className="px-4 py-3.5 pl-5">
                <div className="flex items-center gap-2.5">
                  <BrandDot color={b.brand.color} />
                  <span className="font-semibold text-gray-900">{b.brand.name}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                    {b.totalAds} total
                  </span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className="font-mono font-bold text-gray-900">{b.activeAds}</span>
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className={`font-mono text-sm ${b.avgAgeDays > 45 ? 'text-amber-600' : 'text-gray-700'}`}>
                  {b.avgAgeDays}j
                </span>
              </td>
              <td className="px-4 py-3.5">
                <AngleBadge angle={b.topAngle} />
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className={`font-mono text-sm font-semibold ${b.promotionPct > 50 ? 'text-orange-500' : 'text-gray-600'}`}>
                  {b.promotionPct}%
                </span>
              </td>
              <td className="px-4 py-3.5 text-right">
                <span className={`font-mono text-sm font-semibold ${b.emotionalPct > 40 ? 'text-purple-500' : 'text-gray-600'}`}>
                  {b.emotionalPct}%
                </span>
              </td>
              <td className="px-4 py-3.5">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                  {topCta(b.ctas)}
                </span>
              </td>
              <td className="px-4 py-3.5 text-right pr-5">
                <span className="font-mono text-xs text-gray-500">
                  {fmtSpend(b.totalSpendLow, b.totalSpendHigh)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 text-center mt-3 pb-2">
        Cliquer sur une marque pour voir le détail des créas →
      </p>
    </div>
  );
}

// ─── Gaps matrix view ─────────────────────────────────────────────────────────

function GapsView({ brands }: { brands: BrandSummary[] }) {
  const maxCount = useMemo(() => {
    let m = 0;
    for (const b of brands) {
      for (const angle of ANGLE_ORDER) {
        if ((b.angles[angle] ?? 0) > m) m = b.angles[angle] ?? 0;
      }
    }
    return m;
  }, [brands]);

  function cellBg(count: number): string {
    if (count === 0) return 'bg-gray-50 text-gray-300';
    const ratio = count / maxCount;
    if (ratio > 0.6) return 'bg-green-200 text-green-900 font-bold';
    if (ratio > 0.3) return 'bg-green-100 text-green-700 font-semibold';
    return 'bg-green-50 text-green-600';
  }

  const pictaId = 'picta';

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-48">
              Angle créatif
            </th>
            {brands.map((b) => (
              <th key={b.brand.id} className="px-3 py-3 text-center text-[11px] font-semibold text-gray-600">
                <div className="flex flex-col items-center gap-1.5">
                  <BrandDot color={b.brand.color} />
                  <span className={b.brand.id === pictaId ? 'text-blue-600' : ''}>{b.brand.name}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ANGLE_ORDER.map((angle) => {
            const totalAcrossCompetitors = brands
              .filter((b) => b.brand.id !== pictaId)
              .reduce((s, b) => s + (b.angles[angle] ?? 0), 0);
            const pictaBrand = brands.find((b) => b.brand.id === pictaId);
            const pictaCount = pictaBrand?.angles[angle] ?? 0;
            const isGap = totalAcrossCompetitors >= 3 && pictaCount === 0;

            return (
              <tr key={angle} className={`border-t border-gray-100 ${isGap ? 'bg-red-50/40' : ''}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: ANGLE_COLORS[angle] }}
                    />
                    <span className="text-xs font-semibold text-gray-700">{ANGLE_LABELS[angle]}</span>
                    {isGap && (
                      <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">GAP</span>
                    )}
                  </div>
                </td>
                {brands.map((b) => {
                  const count = b.angles[angle] ?? 0;
                  return (
                    <td
                      key={b.brand.id}
                      className={`px-3 py-3 text-center text-sm rounded-sm ${cellBg(count)} ${b.brand.id === pictaId ? 'ring-1 ring-blue-300 ring-inset' : ''}`}
                    >
                      {count === 0 ? '—' : count}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-4 mt-4 px-4 text-[10px] text-gray-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gray-50 border border-gray-200 inline-block" /> 0 ads</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-50 inline-block" /> 1–2 ads</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-100 inline-block" /> 3–5 ads</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> 6+ ads</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-red-300 bg-red-50 inline-block" /> GAP concurrentiel</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-blue-300 inline-block" /> Picta</span>
      </div>
    </div>
  );
}

// ─── Positioning scatter view ─────────────────────────────────────────────────

const QUADRANT_LABELS = [
  { x: 10,  y: 88, label: 'Marque lifestyle',       color: '#8B5CF6' },
  { x: 60,  y: 88, label: 'Storytelling promo',     color: '#F97316' },
  { x: 10,  y: 10, label: 'Produit / Technique',    color: '#3B82F6' },
  { x: 60,  y: 10, label: 'Discount agressif',       color: '#EF4444' },
];

interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  name: string;
  color: string;
  totalAds: number;
}

function CustomScatterDot(props: {
  cx?: number; cy?: number; payload?: ScatterPoint;
}) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  const r = Math.max(16, Math.min(36, 12 + Math.sqrt(payload.totalAds) * 3));
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={payload.color} fillOpacity={0.2} stroke={payload.color} strokeWidth={2} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" className="text-[10px]" fill={payload.color} fontSize={11} fontWeight={700}>
        {payload.name.substring(0, 3).toUpperCase()}
      </text>
      <text x={cx} y={cy + r + 10} textAnchor="middle" fill="#6B7280" fontSize={10}>
        {payload.totalAds} ads
      </text>
    </g>
  );
}

function CustomScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-sm">
      <p className="font-bold text-gray-900 mb-1" style={{ color: d.color }}>{d.name}</p>
      <p className="text-gray-600 text-xs">Promotion : <strong>{d.x}%</strong></p>
      <p className="text-gray-600 text-xs">Lifestyle : <strong>{d.y}%</strong></p>
      <p className="text-gray-600 text-xs">Ads actives : <strong>{d.totalAds}</strong></p>
    </div>
  );
}

function PositioningView({ brands }: { brands: BrandSummary[] }) {
  const data: ScatterPoint[] = brands.map((b) => ({
    x: b.promotionPct,
    y: b.emotionalPct,
    z: b.activeAds * 100,
    name: b.brand.name,
    color: b.brand.color,
    totalAds: b.activeAds,
  }));

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          <strong>X</strong> = intensité promotionnelle (% d'ads avec angle Promotion / Prix) ·{' '}
          <strong>Y</strong> = intensité lifestyle (% d'ads avec angle Lifestyle / Occasion) ·{' '}
          taille = nombre d'ads actives
        </p>
      </div>
      <div className="relative">
        {/* Quadrant label overlays */}
        <div className="absolute inset-0 pointer-events-none" style={{ top: 24, left: 70, right: 30, bottom: 60 }}>
          {QUADRANT_LABELS.map((q) => (
            <div
              key={q.label}
              className="absolute text-[10px] font-semibold opacity-40"
              style={{ left: `${q.x}%`, top: `${100 - q.y}%`, color: q.color, transform: 'translate(-50%, -50%)' }}
            >
              {q.label}
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 24, right: 30, bottom: 60, left: 70 }}>
            <XAxis
              type="number" dataKey="x" domain={[0, 100]} tickCount={6}
              label={{ value: '% Promotion →', position: 'insideBottom', offset: -40, style: { fontSize: 11, fill: '#9CA3AF' } }}
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
            />
            <YAxis
              type="number" dataKey="y" domain={[0, 100]} tickCount={6}
              label={{ value: '% Lifestyle →', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 11, fill: '#9CA3AF' } }}
              tick={{ fontSize: 10, fill: '#9CA3AF' }}
            />
            <ZAxis type="number" dataKey="z" range={[400, 2500]} />
            <ReferenceLine x={50} stroke="#E5E7EB" strokeDasharray="4 4" />
            <ReferenceLine y={50} stroke="#E5E7EB" strokeDasharray="4 4" />
            <Tooltip content={<CustomScatterTooltip />} />
            <Scatter
              data={data}
              shape={<CustomScatterDot />}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {brands.map((b) => (
          <span key={b.brand.id} className="flex items-center gap-1.5 text-xs text-gray-600">
            <BrandDot color={b.brand.color} />
            {b.brand.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Brand detail view ────────────────────────────────────────────────────────

function DetailView({
  summary,
  onBack,
}: {
  summary: BrandSummary;
  onBack: () => void;
}) {
  const { brand, ads } = summary;
  const activeAds = ads.filter((a) => a.isActive);

  const maxAngle = Math.max(...ANGLE_ORDER.map((a) => summary.angles[a] ?? 0), 1);
  const maxCta   = Math.max(...Object.values(summary.ctas), 1);

  const ctaEntries = Object.entries(summary.ctas).sort(([, a], [, b]) => b - a);

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors"
      >
        <IconBack /> Retour à la synthèse
      </button>

      {/* Brand header */}
      <div className="flex items-center gap-3 mb-5">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: brand.color }} />
        <h3 className="text-xl font-bold text-gray-900">{brand.name}</h3>
        <AngleBadge angle={summary.topAngle} />
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Ads actives"         value={summary.activeAds}    sub={`${summary.totalAds} total`} />
        <KpiCard label="Âge moyen"           value={`${summary.avgAgeDays}j`} sub={`max ${summary.longestRunningDays}j`} />
        <KpiCard label="Angle dominant"      value={ANGLE_LABELS[summary.topAngle]} />
        <KpiCard label="Top CTA"             value={topCta(summary.ctas)} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Angle breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Répartition des angles (toutes ads)</h4>
          <div className="space-y-2.5">
            {ANGLE_ORDER.map((angle) => {
              const count = summary.angles[angle] ?? 0;
              if (count === 0) return null;
              return (
                <HBar key={angle} label={ANGLE_LABELS[angle]} count={count} max={maxAngle} color={ANGLE_COLORS[angle]} />
              );
            })}
          </div>
        </div>

        {/* CTA breakdown */}
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Répartition des CTA (ads actives)</h4>
          {ctaEntries.length > 0 ? (
            <div className="space-y-2.5">
              {ctaEntries.map(([cta, count]) => (
                <HBar key={cta} label={CTA_LABELS[cta] ?? cta} count={count} max={maxCta} color={brand.color} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">Aucun CTA détecté</p>
          )}
        </div>
      </div>

      {/* Ad list */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Ads actives · {activeAds.length} créa{activeAds.length !== 1 ? 's' : ''}
          </h4>
        </div>
        {activeAds.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 italic">Aucune ad active sur la période.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {activeAds.slice(0, 12).map((ad) => (
              <div key={ad.id} className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <AngleBadge angle={ad.angle} />
                  <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                    {CTA_LABELS[ad.cta] ?? ad.cta}
                  </span>
                  <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">
                    {ad.ageDays}j
                  </span>
                  {ad.hasDiscount && (
                    <span className="text-[11px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded font-medium">
                      {ad.discountPct ? `−${ad.discountPct}%` : 'Promo'}
                    </span>
                  )}
                  <span className="text-[11px] text-gray-400 ml-auto font-mono">
                    {fmtSpend(ad.spendLow, ad.spendHigh)}
                  </span>
                </div>
                {ad.title && (
                  <p className="text-sm font-semibold text-gray-900 mb-1">{ad.title}</p>
                )}
                <p className="text-sm text-gray-600 leading-relaxed">{ad.body}</p>
                {ad.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {ad.keywords.map((kw) => (
                      <span key={kw} className="text-[10px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main VeilleDashboard ─────────────────────────────────────────────────────

export default function VeilleDashboard() {
  const [data,     setData]     = useState<VeilleData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [view,     setView]     = useState<ViewMode>('synthesis');
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/veille');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: VeilleData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectedBrand = useMemo(
    () => data?.brands.find((b) => b.brand.id === selectedBrandId) ?? null,
    [data, selectedBrandId],
  );

  function selectBrand(id: string) {
    setSelectedBrandId(id);
    setView('detail');
  }

  function goBack() {
    setView('synthesis');
    setSelectedBrandId(null);
  }

  // ── KPI derivations ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!data) return null;
    const { brands } = data;
    const totalActive = brands.reduce((s, b) => s + b.activeAds, 0);
    const mostActive  = [...brands].sort((a, b) => b.activeAds - a.activeAds)[0];
    const avgAge      = brands.filter((b) => b.activeAds > 0).reduce((s, b) => s + b.avgAgeDays, 0) /
                        Math.max(1, brands.filter((b) => b.activeAds > 0).length);
    // Gap = angle with most competitor coverage but 0 Picta usage
    const picta = brands.find((b) => b.brand.id === 'picta');
    const gapAngle = ANGLE_ORDER.find((angle) => {
      const competitorTotal = brands.filter((b) => b.brand.id !== 'picta').reduce((s, b) => s + (b.angles[angle] ?? 0), 0);
      return competitorTotal >= 3 && (picta?.angles[angle] ?? 0) === 0;
    });
    return { totalActive, mostActive, avgAge: Math.round(avgAge), gapAngle };
  }, [data]);

  // ── Views definition ───────────────────────────────────────────────────────
  const VIEWS: { key: ViewMode; label: string }[] = [
    { key: 'synthesis',   label: 'Synthèse' },
    { key: 'gaps',        label: 'Gaps créatifs' },
    { key: 'positioning', label: 'Positionnement' },
    ...(selectedBrand ? [{ key: 'detail' as ViewMode, label: `↳ ${selectedBrand.brand.name}` }] : []),
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Veille concurrentielle · Photo Print · US</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {data
              ? `Analyse de ${data.brands.length} marques · Mis à jour ${new Date(data.fetchedAt).toLocaleString('fr-FR')}`
              : 'Chargement…'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data?.source === 'mock' && <MockBadge />}
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200 disabled:opacity-50 transition-all"
          >
            <IconRefresh spin={loading} />
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          Erreur : {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      )}

      {/* Content */}
      {data && kpis && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="Ads actives suivies"
              value={kpis.totalActive}
              sub={`${data.brands.length} marques`}
            />
            <KpiCard
              label="Marque la + active"
              value={kpis.mostActive?.brand.name ?? '—'}
              sub={`${kpis.mostActive?.activeAds ?? 0} ads actives`}
            />
            <KpiCard
              label="Âge moyen des créas"
              value={`${kpis.avgAge}j`}
              sub="actives uniquement"
            />
            <KpiCard
              label="Gap prioritaire"
              value={kpis.gapAngle ? ANGLE_LABELS[kpis.gapAngle] : 'Aucun'}
              sub={kpis.gapAngle ? '0 créa Picta vs concurrence' : 'Bonne couverture !'}
            />
          </div>

          {/* View tabs */}
          <div className="flex gap-0 border-b border-gray-200">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => {
                  if (v.key !== 'detail') setSelectedBrandId(null);
                  setView(v.key);
                }}
                className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all ${
                  view === v.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {view === 'synthesis' && (
              <SynthesisView brands={data.brands} onSelectBrand={selectBrand} />
            )}
            {view === 'gaps' && (
              <div className="px-4 py-4">
                <GapsView brands={data.brands} />
              </div>
            )}
            {view === 'positioning' && (
              <div className="px-4 py-4">
                <PositioningView brands={data.brands} />
              </div>
            )}
            {view === 'detail' && selectedBrand && (
              <div className="px-4 py-4">
                <DetailView summary={selectedBrand} onBack={goBack} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
