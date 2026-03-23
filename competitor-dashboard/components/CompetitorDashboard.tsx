'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { CompetitorData, BrandSummary, CopyAngle, CompetitorAd } from '@/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, Cell,
} from 'recharts';

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
  SHOP_NOW: 'Shop Now', ORDER_NOW: 'Order Now', GET_OFFER: 'Get Offer',
  LEARN_MORE: 'Learn More', SUBSCRIBE_NOW: 'Subscribe', SIGN_UP: 'Sign Up',
  TRY_NOW: 'Try Now', BOOK_NOW: 'Book Now', GET_STARTED: 'Get Started',
  CONTACT_US: 'Contact Us', DOWNLOAD: 'Download', WATCH_MORE: 'Watch More',
};

const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'FB', instagram: 'IG', messenger: 'MS', audience_network: 'AN',
};

const COUNTRIES = ['US', 'FR', 'GB', 'DE', 'CA', 'AU', 'ES', 'IT', 'NL', 'BE'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSpend(low: number, high: number) {
  if (low === 0 && high === 0) return '—';
  const f = (n: number) => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${n}`;
  return `${f(low)}–${f(high)}`;
}

function fmtImpressions(low: number, high: number) {
  if (low === 0 && high === 0) return '—';
  const f = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
  return `${f(low)}–${f(high)}`;
}

function topCta(ctas: Record<string, number>): string {
  const k = Object.entries(ctas).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '';
  return CTA_LABELS[k] ?? k;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconRefresh({ spin }: { spin?: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
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

function IconChevronDown() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function IconExternal() {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

function BrandDot({ color }: { color: string }) {
  return <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 inline-block" style={{ backgroundColor: color }} />;
}

function AngleBadge({ angle }: { angle: CopyAngle }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: ANGLE_COLORS[angle] + '22', color: ANGLE_COLORS[angle] }}
    >
      {ANGLE_LABELS[angle]}
    </span>
  );
}

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
      Live · Meta Ad Library
    </span>
  );
}

function MockBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      Données simulées
    </span>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-extrabold leading-none ${accent ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function HBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="w-40 text-right text-gray-600 truncate flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-6 text-right font-mono text-gray-700 flex-shrink-0">{count}</span>
    </div>
  );
}

// ─── Ad Card ──────────────────────────────────────────────────────────────────

function AdCard({ ad, brandColor }: { ad: CompetitorAd; brandColor: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-gray-100 rounded-xl p-4 bg-white hover:border-gray-200 transition-all">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <AngleBadge angle={ad.angle} />
          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
            {CTA_LABELS[ad.cta] ?? ad.cta}
          </span>
          <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-mono">
            {ad.ageDays}j
          </span>
          {ad.isActive ? (
            <span className="text-[11px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded font-semibold">Actif</span>
          ) : (
            <span className="text-[11px] bg-gray-50 text-gray-400 px-2 py-0.5 rounded">Inactif</span>
          )}
          {ad.hasDiscount && (
            <span className="text-[11px] bg-orange-50 text-orange-600 px-2 py-0.5 rounded font-bold">
              {ad.discountPct ? `−${ad.discountPct}%` : 'Promo'}
            </span>
          )}
        </div>
        {ad.snapshotUrl && (
          <a
            href={ad.snapshotUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 flex-shrink-0"
          >
            Preview <IconExternal />
          </a>
        )}
      </div>

      {/* Platforms */}
      <div className="flex items-center gap-1.5 mb-2">
        {ad.platforms.map((p) => (
          <span key={p} className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
            {PLATFORM_ICONS[p] ?? p.toUpperCase()}
          </span>
        ))}
        <span className="text-[10px] text-gray-400 ml-1">
          {new Date(ad.deliveryStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
          {ad.deliveryStop && ` → ${new Date(ad.deliveryStop).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}`}
        </span>
      </div>

      {/* Title */}
      {ad.title && <p className="text-sm font-semibold text-gray-900 mb-1">{ad.title}</p>}

      {/* Body */}
      <p className={`text-sm text-gray-600 leading-relaxed ${!expanded && ad.body.length > 120 ? 'line-clamp-2' : ''}`}>
        {ad.body}
      </p>
      {ad.body.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[11px] text-blue-500 hover:text-blue-700 mt-1"
        >
          {expanded ? 'Réduire' : 'Lire plus'}
        </button>
      )}

      {/* Keywords + metrics */}
      <div className="flex items-center justify-between mt-3">
        <div className="flex flex-wrap gap-1">
          {ad.keywords.map((kw) => (
            <span key={kw} className="text-[10px] bg-gray-50 text-gray-400 px-1.5 py-0.5 rounded border border-gray-100">
              {kw}
            </span>
          ))}
        </div>
        <div className="text-right flex-shrink-0 ml-3">
          <p className="text-[10px] text-gray-400">Impressions</p>
          <p className="text-xs font-mono text-gray-600">{fmtImpressions(ad.impressionsLow, ad.impressionsHigh)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Spend est.</p>
          <p className="text-xs font-mono text-gray-600">{fmtSpend(ad.spendLow, ad.spendHigh)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Timeline view ────────────────────────────────────────────────────────────

function TimelineView({ brands }: { brands: BrandSummary[] }) {
  const now = Date.now();
  const allAds = brands.flatMap((b) =>
    b.ads.map((ad) => ({ ...ad, brandColor: b.brand.color, brandName: b.brand.name })),
  );

  // Sort by start date desc
  const sorted = [...allAds].sort(
    (a, b) => new Date(b.deliveryStart).getTime() - new Date(a.deliveryStart).getTime(),
  );

  // Build timeline buckets: last 7d, 7–30d, 30–60d, 60d+
  const buckets: { label: string; minDays: number; maxDays: number }[] = [
    { label: '7 derniers jours', minDays: 0,  maxDays: 7  },
    { label: '7–30 jours',       minDays: 7,  maxDays: 30 },
    { label: '30–60 jours',      minDays: 30, maxDays: 60 },
    { label: '60+ jours',        minDays: 60, maxDays: 9999 },
  ];

  return (
    <div className="space-y-6">
      {buckets.map((bucket) => {
        const items = sorted.filter(
          (a) => a.ageDays >= bucket.minDays && a.ageDays < bucket.maxDays,
        );
        if (items.length === 0) return null;
        return (
          <div key={bucket.label}>
            <div className="flex items-center gap-3 mb-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide">{bucket.label}</h4>
              <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
                {items.length} ads
              </span>
            </div>
            <div className="space-y-2">
              {items.slice(0, 15).map((ad) => (
                <div key={ad.id} className="flex items-start gap-3">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: ad.brandColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold" style={{ color: ad.brandColor }}>
                        {ad.brandName}
                      </span>
                      <AngleBadge angle={ad.angle} />
                      {ad.hasDiscount && (
                        <span className="text-[10px] bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded font-bold">
                          {ad.discountPct ? `−${ad.discountPct}%` : 'Promo'}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto font-mono">
                        {new Date(ad.deliveryStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                        {' · '}J+{ad.ageDays}
                      </span>
                    </div>
                    {ad.title && <p className="text-xs font-medium text-gray-700">{ad.title}</p>}
                    <p className="text-xs text-gray-500 truncate">{ad.body.slice(0, 100)}{ad.body.length > 100 ? '…' : ''}</p>
                  </div>
                </div>
              ))}
              {items.length > 15 && (
                <p className="text-xs text-gray-400 pl-5">+{items.length - 15} ads supplémentaires…</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Gaps matrix ──────────────────────────────────────────────────────────────

function GapsView({ brands }: { brands: BrandSummary[] }) {
  const maxCount = useMemo(() => {
    let m = 0;
    for (const b of brands)
      for (const angle of ANGLE_ORDER)
        if ((b.angles[angle] ?? 0) > m) m = b.angles[angle] ?? 0;
    return m;
  }, [brands]);

  function cellBg(count: number) {
    if (count === 0) return 'bg-gray-50 text-gray-300';
    const r = count / maxCount;
    if (r > 0.6) return 'bg-emerald-200 text-emerald-900 font-bold';
    if (r > 0.3) return 'bg-emerald-100 text-emerald-700 font-semibold';
    return 'bg-emerald-50 text-emerald-600';
  }

  // Bar chart data
  const chartData = ANGLE_ORDER.map((angle) => {
    const row: Record<string, number | string> = { angle: ANGLE_LABELS[angle] };
    for (const b of brands) row[b.brand.name] = b.angles[angle] ?? 0;
    return row;
  });

  return (
    <div className="space-y-6">
      {/* Heatmap table */}
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
                    <span>{b.brand.name}</span>
                  </div>
                </th>
              ))}
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {ANGLE_ORDER.map((angle) => {
              const total = brands.reduce((s, b) => s + (b.angles[angle] ?? 0), 0);
              return (
                <tr key={angle} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ANGLE_COLORS[angle] }} />
                      <span className="text-xs font-semibold text-gray-700">{ANGLE_LABELS[angle]}</span>
                    </div>
                  </td>
                  {brands.map((b) => {
                    const count = b.angles[angle] ?? 0;
                    return (
                      <td key={b.brand.id} className={`px-3 py-3 text-center text-sm ${cellBg(count)}`}>
                        {count === 0 ? '—' : count}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3 text-center text-sm font-mono font-bold text-gray-500">
                    {total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stacked bar chart */}
      <div>
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 px-1">Distribution par angle</h4>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 60, left: 0 }}>
            <XAxis dataKey="angle" tick={{ fontSize: 10, fill: '#9CA3AF' }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} />
            <Tooltip
              contentStyle={{ fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 8 }}
              cursor={{ fill: '#F3F4F6' }}
            />
            {brands.map((b) => (
              <Bar key={b.brand.id} dataKey={b.brand.name} stackId="a" fill={b.brand.color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Positioning scatter ──────────────────────────────────────────────────────

interface ScatterPoint { x: number; y: number; z: number; name: string; color: string; totalAds: number }

function CustomDot(props: { cx?: number; cy?: number; payload?: ScatterPoint }) {
  const { cx = 0, cy = 0, payload } = props;
  if (!payload) return null;
  const r = Math.max(18, Math.min(38, 12 + Math.sqrt(payload.totalAds) * 3.5));
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={payload.color} fillOpacity={0.15} stroke={payload.color} strokeWidth={2} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill={payload.color} fontSize={10} fontWeight={700}>
        {payload.name.slice(0, 4).toUpperCase()}
      </text>
      <text x={cx} y={cy + r + 11} textAnchor="middle" fill="#9CA3AF" fontSize={9}>
        {payload.totalAds} ads
      </text>
    </g>
  );
}

function PositioningView({ brands }: { brands: BrandSummary[] }) {
  const data: ScatterPoint[] = brands.map((b) => ({
    x: b.promotionPct, y: b.emotionalPct,
    z: b.activeAds * 100,
    name: b.brand.name, color: b.brand.color, totalAds: b.activeAds,
  }));

  const quadrants = [
    { x: 12, y: 85, label: 'Marque lifestyle',    color: '#8B5CF6' },
    { x: 62, y: 85, label: 'Storytelling + promo', color: '#F97316' },
    { x: 12, y: 12, label: 'Produit / Tech',        color: '#3B82F6' },
    { x: 62, y: 12, label: 'Discount agressif',     color: '#EF4444' },
  ];

  return (
    <div>
      <p className="text-xs text-gray-400 mb-4">
        <strong>X</strong> = intensité promotionnelle · <strong>Y</strong> = intensité lifestyle/occasion · taille = volume d'ads actives
      </p>
      <div className="relative">
        <div className="absolute inset-0 pointer-events-none" style={{ top: 20, left: 60, right: 20, bottom: 60 }}>
          {quadrants.map((q) => (
            <div
              key={q.label}
              className="absolute text-[10px] font-semibold opacity-30"
              style={{ left: `${q.x}%`, top: `${100 - q.y}%`, color: q.color, transform: 'translate(-50%, -50%)' }}
            >
              {q.label}
            </div>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={360}>
          <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
            <XAxis type="number" dataKey="x" domain={[0, 100]} tickCount={6} tick={{ fontSize: 10, fill: '#9CA3AF' }}
              label={{ value: '% Promotion →', position: 'insideBottom', offset: -40, style: { fontSize: 11, fill: '#9CA3AF' } }} />
            <YAxis type="number" dataKey="y" domain={[0, 100]} tickCount={6} tick={{ fontSize: 10, fill: '#9CA3AF' }}
              label={{ value: '% Lifestyle →', angle: -90, position: 'insideLeft', offset: 15, style: { fontSize: 11, fill: '#9CA3AF' } }} />
            <ZAxis type="number" dataKey="z" range={[400, 2800]} />
            <ReferenceLine x={50} stroke="#E5E7EB" strokeDasharray="4 4" />
            <ReferenceLine y={50} stroke="#E5E7EB" strokeDasharray="4 4" />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = (payload[0].payload as ScatterPoint);
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow px-3 py-2 text-xs">
                    <p className="font-bold mb-1" style={{ color: d.color }}>{d.name}</p>
                    <p className="text-gray-500">Promotion : <strong>{d.x}%</strong></p>
                    <p className="text-gray-500">Lifestyle : <strong>{d.y}%</strong></p>
                    <p className="text-gray-500">Ads actives : <strong>{d.totalAds}</strong></p>
                  </div>
                );
              }}
            />
            <Scatter data={data} shape={<CustomDot />} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 justify-center mt-2">
        {brands.map((b) => (
          <span key={b.brand.id} className="flex items-center gap-1.5 text-xs text-gray-500">
            <BrandDot color={b.brand.color} />
            {b.brand.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Brand detail ─────────────────────────────────────────────────────────────

function BrandDetail({ summary, onBack }: { summary: BrandSummary; onBack: () => void }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [angleFilter, setAngleFilter] = useState<CopyAngle | 'all'>('all');

  const filteredAds = useMemo(() => {
    let ads = summary.ads;
    if (filter === 'active')   ads = ads.filter((a) => a.isActive);
    if (filter === 'inactive') ads = ads.filter((a) => !a.isActive);
    if (angleFilter !== 'all') ads = ads.filter((a) => a.angle === angleFilter);
    return ads;
  }, [summary.ads, filter, angleFilter]);

  const maxAngle = Math.max(...ANGLE_ORDER.map((a) => summary.angles[a] ?? 0), 1);
  const maxCta   = Math.max(...Object.values(summary.ctas), 1);

  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-5 transition-colors">
        <IconBack /> Retour à la synthèse
      </button>

      <div className="flex items-center gap-3 mb-5">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: summary.brand.color }} />
        <h3 className="text-xl font-bold text-gray-900">{summary.brand.name}</h3>
        <AngleBadge angle={summary.topAngle} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Ads actives"    value={summary.activeAds}           sub={`${summary.totalAds} total`} />
        <KpiCard label="Âge moyen"      value={`${summary.avgAgeDays}j`}    sub={`max ${summary.longestRunningDays}j`} />
        <KpiCard label="% Promotion"    value={`${summary.promotionPct}%`}  accent={summary.promotionPct > 50 ? 'text-orange-500' : undefined} />
        <KpiCard label="Spend estimé"   value={fmtSpend(summary.totalSpendLow, summary.totalSpendHigh)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Répartition angles</h4>
          <div className="space-y-2.5">
            {ANGLE_ORDER.filter((a) => (summary.angles[a] ?? 0) > 0).map((angle) => (
              <HBar key={angle} label={ANGLE_LABELS[angle]} count={summary.angles[angle] ?? 0} max={maxAngle} color={ANGLE_COLORS[angle]} />
            ))}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Répartition CTA</h4>
          <div className="space-y-2.5">
            {Object.entries(summary.ctas).sort(([, a], [, b]) => b - a).map(([cta, count]) => (
              <HBar key={cta} label={CTA_LABELS[cta] ?? cta} count={count} max={maxCta} color={summary.brand.color} />
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-0 border border-gray-200 rounded-lg overflow-hidden text-xs">
          {(['all', 'active', 'inactive'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 font-semibold transition-all ${filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
            >
              {f === 'all' ? 'Toutes' : f === 'active' ? 'Actives' : 'Inactives'}
            </button>
          ))}
        </div>
        <select
          value={angleFilter}
          onChange={(e) => setAngleFilter(e.target.value as CopyAngle | 'all')}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none"
        >
          <option value="all">Tous les angles</option>
          {ANGLE_ORDER.map((a) => (
            <option key={a} value={a}>{ANGLE_LABELS[a]}</option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{filteredAds.length} ads</span>
      </div>

      {/* Ad cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filteredAds.slice(0, 20).map((ad) => (
          <AdCard key={ad.id} ad={ad} brandColor={summary.brand.color} />
        ))}
        {filteredAds.length === 0 && (
          <p className="text-sm text-gray-400 italic col-span-2">Aucune ad pour ces filtres.</p>
        )}
      </div>
    </div>
  );
}

// ─── Search panel ─────────────────────────────────────────────────────────────

function SearchPanel({ country }: { country: string }) {
  const [query, setQuery]   = useState('');
  const [results, setResults] = useState<CompetitorAd[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]   = useState('');

  async function doSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setSearched(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&country=${country}`);
      const json = await res.json();
      if (json.error) { setError(json.error); setResults([]); }
      else setResults(json.ads ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Group by page name
  const byPage = useMemo(() => {
    const map = new Map<string, { name: string; ads: CompetitorAd[] }>();
    for (const ad of results) {
      if (!map.has(ad.pageId)) map.set(ad.pageId, { name: ad.pageName, ads: [] });
      map.get(ad.pageId)!.ads.push(ad);
    }
    return [...map.values()].sort((a, b) => b.ads.length - a.ads.length);
  }, [results]);

  return (
    <div>
      <form onSubmit={doSearch} className="flex items-center gap-2 mb-6">
        <div className="relative flex-1 max-w-md">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><IconSearch /></span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher des ads (ex: photo book, canvas, prints…)"
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-all"
        >
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {!searched && (
        <div className="text-center py-12 text-gray-400">
          <IconSearch />
          <p className="text-sm mt-3">Entrez un mot-clé pour chercher dans la Meta Ad Library</p>
          <p className="text-xs mt-1">Ex : "photo book", "canvas prints", "photo gifts"…</p>
        </div>
      )}

      {searched && !loading && results.length === 0 && !error && (
        <p className="text-center text-sm text-gray-400 py-12">Aucun résultat pour « {query} »</p>
      )}

      {byPage.map((group) => (
        <div key={group.name} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-sm font-bold text-gray-800">{group.name}</h4>
            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-mono">
              {group.ads.length} ad{group.ads.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {group.ads.map((ad) => (
              <AdCard key={ad.id} ad={ad} brandColor="#3B82F6" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main synthesis table ─────────────────────────────────────────────────────

function SynthesisTable({ brands, onSelect }: { brands: BrandSummary[]; onSelect: (id: string) => void }) {
  type SortKey = 'name' | 'activeAds' | 'avgAge' | 'promo' | 'lifestyle' | 'spend';
  const [sortKey, setSortKey] = useState<SortKey>('activeAds');
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    return [...brands].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortKey) {
        case 'name':      va = a.brand.name;         vb = b.brand.name;         break;
        case 'activeAds': va = a.activeAds;           vb = b.activeAds;          break;
        case 'avgAge':    va = a.avgAgeDays;          vb = b.avgAgeDays;         break;
        case 'promo':     va = a.promotionPct;        vb = b.promotionPct;       break;
        case 'lifestyle': va = a.emotionalPct;        vb = b.emotionalPct;       break;
        case 'spend':     va = a.totalSpendHigh;      vb = b.totalSpendHigh;     break;
        default:          va = 0;                     vb = 0;
      }
      if (typeof va === 'string') return sortAsc ? va.localeCompare(String(vb)) : String(vb).localeCompare(va);
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }, [brands, sortKey, sortAsc]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const th = (key: SortKey, label: string, align: 'left' | 'right' = 'right') => (
    <th
      onClick={() => handleSort(key)}
      className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-wide cursor-pointer select-none hover:text-blue-600 transition-colors text-${align} ${sortKey === key ? 'text-blue-600' : 'text-gray-400'}`}
    >
      {label} {sortKey === key ? (sortAsc ? '↑' : '↓') : ''}
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            {th('name', 'Marque', 'left')}
            {th('activeAds', 'Actives')}
            {th('avgAge', 'Âge moy.')}
            <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide text-left">Angle top</th>
            {th('promo', '% Promo')}
            {th('lifestyle', '% Lifestyle')}
            <th className="px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Top CTA</th>
            {th('spend', 'Spend est.')}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map((b) => (
            <tr
              key={b.brand.id}
              onClick={() => onSelect(b.brand.id)}
              className="hover:bg-blue-50/30 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <BrandDot color={b.brand.color} />
                  <span className="font-semibold text-gray-900">{b.brand.name}</span>
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">{b.totalAds} total</span>
                </div>
              </td>
              <td className="px-4 py-3.5 text-right font-mono font-bold text-gray-900">{b.activeAds}</td>
              <td className={`px-4 py-3.5 text-right font-mono text-sm ${b.avgAgeDays > 45 ? 'text-amber-600' : 'text-gray-700'}`}>
                {b.avgAgeDays}j
              </td>
              <td className="px-4 py-3.5"><AngleBadge angle={b.topAngle} /></td>
              <td className={`px-4 py-3.5 text-right font-mono text-sm font-semibold ${b.promotionPct > 50 ? 'text-orange-500' : 'text-gray-600'}`}>
                {b.promotionPct}%
              </td>
              <td className={`px-4 py-3.5 text-right font-mono text-sm font-semibold ${b.emotionalPct > 40 ? 'text-purple-500' : 'text-gray-600'}`}>
                {b.emotionalPct}%
              </td>
              <td className="px-4 py-3.5 text-center">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">{topCta(b.ctas)}</span>
              </td>
              <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500 pr-5">
                {fmtSpend(b.totalSpendLow, b.totalSpendHigh)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 text-center py-3">
        Cliquer sur une marque pour voir le détail →
      </p>
    </div>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────

type Tab = 'synthesis' | 'gaps' | 'positioning' | 'timeline' | 'search' | 'detail';

export default function CompetitorDashboard() {
  const [data,    setData]    = useState<CompetitorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [tab,     setTab]     = useState<Tab>('synthesis');
  const [selected, setSelected] = useState<string | null>(null);
  const [country, setCountry] = useState('US');
  const [countryOpen, setCountryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/ads?country=${country}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [country]);

  useEffect(() => { load(); }, [load]);

  const selectedBrand = useMemo(
    () => data?.brands.find((b) => b.brand.id === selected) ?? null,
    [data, selected],
  );

  function selectBrand(id: string) {
    setSelected(id);
    setTab('detail');
  }

  const kpis = useMemo(() => {
    if (!data) return null;
    const { brands } = data;
    const totalActive = brands.reduce((s, b) => s + b.activeAds, 0);
    const mostActive  = [...brands].sort((a, b) => b.activeAds - a.activeAds)[0];
    const avgAge      = brands.length > 0
      ? brands.reduce((s, b) => s + b.avgAgeDays, 0) / brands.length
      : 0;
    const topPromoter = [...brands].sort((a, b) => b.promotionPct - a.promotionPct)[0];
    return { totalActive, mostActive, avgAge: Math.round(avgAge), topPromoter };
  }, [data]);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'synthesis',   label: 'Synthèse' },
    { key: 'gaps',        label: 'Gaps créatifs' },
    { key: 'positioning', label: 'Positionnement' },
    { key: 'timeline',    label: 'Timeline' },
    { key: 'search',      label: 'Recherche libre' },
    ...(selectedBrand ? [{ key: 'detail' as Tab, label: `↳ ${selectedBrand.brand.name}` }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="text-white text-xs font-black">C</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-gray-900 leading-none">Competitor Monitor</h1>
              <p className="text-[10px] text-gray-400 mt-0.5">Meta Ad Library</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Country selector */}
            <div className="relative">
              <button
                onClick={() => setCountryOpen(!countryOpen)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg bg-white text-gray-600 hover:bg-gray-50"
              >
                {country} <IconChevronDown />
              </button>
              {countryOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-20">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setCountry(c); setCountryOpen(false); }}
                      className={`block w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 ${c === country ? 'font-bold text-blue-600' : 'text-gray-700'}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {data?.source === 'live' ? <LiveBadge /> : data ? <MockBadge /> : null}
            <button
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-all"
            >
              <IconRefresh spin={loading} />
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            Erreur : {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !data && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
            </div>
            <div className="h-64 bg-gray-200 rounded-xl animate-pulse" />
          </div>
        )}

        {data && kpis && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label="Ads actives suivies"
                value={kpis.totalActive}
                sub={`${data.brands.length} marques · ${country}`}
              />
              <KpiCard
                label="Marque la + active"
                value={kpis.mostActive?.brand.name ?? '—'}
                sub={`${kpis.mostActive?.activeAds ?? 0} ads actives`}
              />
              <KpiCard
                label="Âge moyen créas"
                value={`${kpis.avgAge}j`}
                sub="toutes marques"
              />
              <KpiCard
                label="Top promoteur"
                value={kpis.topPromoter?.brand.name ?? '—'}
                sub={`${kpis.topPromoter?.promotionPct ?? 0}% d'ads promo`}
                accent="text-orange-500"
              />
            </div>

            {/* Last fetch info */}
            <p className="text-[11px] text-gray-400">
              Dernière mise à jour : {new Date(data.fetchedAt).toLocaleString('fr-FR')}
              {data.source === 'live' && ' · Données live Meta Ad Library'}
            </p>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-gray-200 overflow-x-auto scrollbar-thin">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    if (t.key !== 'detail') setSelected(null);
                    setTab(t.key);
                  }}
                  className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-all ${
                    tab === t.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Panel */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              {tab === 'synthesis' && (
                <SynthesisTable brands={data.brands} onSelect={selectBrand} />
              )}
              {tab === 'gaps' && (
                <div className="p-5">
                  <GapsView brands={data.brands} />
                </div>
              )}
              {tab === 'positioning' && (
                <div className="p-5">
                  <PositioningView brands={data.brands} />
                </div>
              )}
              {tab === 'timeline' && (
                <div className="p-5">
                  <TimelineView brands={data.brands} />
                </div>
              )}
              {tab === 'search' && (
                <div className="p-5">
                  <SearchPanel country={country} />
                </div>
              )}
              {tab === 'detail' && selectedBrand && (
                <div className="p-5">
                  <BrandDetail summary={selectedBrand} onBack={() => { setTab('synthesis'); setSelected(null); }} />
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
