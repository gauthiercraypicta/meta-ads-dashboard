'use client';

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FunnelData {
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  spend: number;
}

export interface IndustryBenchmarks {
  ctr: number; // ex: 0.009 = 0.9%
  cvr: number; // ex: 0.10 = 10%
}

interface Props {
  data: FunnelData;
  benchmarks?: IndustryBenchmarks;
}

const DEFAULT_BENCHMARKS: IndustryBenchmarks = { ctr: 0.009, cvr: 0.10 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pctBar(val: number, max: number): number {
  if (!max) return 0;
  return Math.round(Math.sqrt(val / max) * 100);
}

function fmtBig(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return `${v}`;
}

function fmtMoney(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

// ─── Step component ───────────────────────────────────────────────────────────

interface StepProps {
  label: string;
  icon: string;
  value: number;
  formatted: string;
  barPct: number;
  benchmarkPct?: number;
  color: string;
}

function FunnelStep({ label, icon, value, formatted, barPct, benchmarkPct, color }: StepProps) {
  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
          <span>{icon}</span>{label}
        </span>
        <span className="text-sm font-bold text-gray-900 font-mono">{formatted}</span>
      </div>
      <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
        {/* Main bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
          style={{ width: `${barPct}%`, background: color }}
        />
        {/* Benchmark bar */}
        {benchmarkPct != null && (
          <div
            className="absolute inset-y-0 left-0 rounded-lg border-2 border-dashed border-gray-400 bg-transparent"
            style={{ width: `${benchmarkPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Rate row ─────────────────────────────────────────────────────────────────

interface RateRowProps {
  label: string;
  actual: number;
  benchmark?: number;
  isGood: boolean;
  badge?: string;
}

function RateRow({ label, actual, benchmark, isGood, badge }: RateRowProps) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-dashed border-gray-100 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">{label}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
            {badge}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {benchmark != null && (
          <span className="text-[10px] text-gray-400 font-mono">Bench: {fmtPct(benchmark)}</span>
        )}
        <span
          className={`text-xs font-bold font-mono ${isGood ? 'text-green-600' : 'text-red-500'}`}
        >
          {fmtPct(actual)}
        </span>
        <span className={`text-sm ${isGood ? 'text-green-500' : 'text-red-400'}`}>
          {isGood ? '✓' : '↓'}
        </span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConversionFunnelVisual({ data, benchmarks = DEFAULT_BENCHMARKS }: Props) {
  const { impressions, clicks, conversions, revenue, spend } = data;

  const ctr = impressions > 0 ? clicks / impressions : 0;
  const cvr = clicks > 0 ? conversions / clicks : 0;
  const roas = spend > 0 ? revenue / spend : 0;
  const roi  = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;

  const ctrOk = ctr >= benchmarks.ctr;
  const cvrOk = cvr >= benchmarks.cvr;

  // Determine max for bar scaling (use impressions)
  const maxVal = Math.max(impressions, 1);

  const benchClicksPct    = pctBar(impressions * benchmarks.ctr, maxVal);
  const benchConvPct      = pctBar(impressions * benchmarks.ctr * benchmarks.cvr, maxVal);

  const steps: StepProps[] = [
    {
      label: 'Impressions',
      icon: '👁️',
      value: impressions,
      formatted: fmtBig(impressions),
      barPct: 100,
      color: '#3b82f6',
    },
    {
      label: 'Clics',
      icon: '🖱️',
      value: clicks,
      formatted: fmtBig(clicks),
      barPct: pctBar(clicks, maxVal),
      benchmarkPct: benchClicksPct,
      color: ctrOk ? '#3b82f6' : '#f97316',
    },
    {
      label: 'Conversions',
      icon: '⚡',
      value: conversions,
      formatted: fmtBig(conversions),
      barPct: pctBar(conversions, maxVal),
      benchmarkPct: benchConvPct,
      color: cvrOk ? '#10b981' : '#ef4444',
    },
    {
      label: 'Revenue',
      icon: '💰',
      value: revenue,
      formatted: fmtMoney(revenue),
      barPct: pctBar(revenue, maxVal * (revenue / Math.max(impressions, 1))),
      color: roas >= 2 ? '#10b981' : '#f59e0b',
    },
  ];

  // Fix revenue bar relative to its own scale
  steps[3].barPct = Math.min(100, Math.round((roas / 4) * 100));

  const diagnostics = [
    ...(!ctrOk ? ['⚠️ Problème créatif/audience — CTR sous benchmark'] : []),
    ...(!cvrOk ? ['⚠️ Problème landing page — CVR sous benchmark'] : []),
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Funnel de Conversion</h3>
          <p className="text-xs text-gray-500 mt-0.5">Barre pleine = réel · Pointillés = benchmark industrie</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">ROAS</p>
          <p className={`text-lg font-bold font-mono ${roas >= 2.22 ? 'text-green-600' : roas >= 1.5 ? 'text-orange-500' : 'text-red-500'}`}>
            {roas.toFixed(2)}x
          </p>
        </div>
      </div>

      {/* Diagnostic badges */}
      {diagnostics.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {diagnostics.map((d) => (
            <div key={d} className="flex items-center gap-2 text-xs bg-orange-50 border border-orange-200 text-orange-800 rounded-lg px-3 py-2">
              {d}
            </div>
          ))}
        </div>
      )}

      {/* Funnel steps */}
      <div className="space-y-3 mb-4">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <FunnelStep {...step} />
            {i < steps.length - 1 && (
              <div className="flex items-center gap-2 py-0.5 px-2">
                <div className="w-px h-3 bg-gray-200 mx-4" />
                <span className="text-gray-400 text-[10px]">▼</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Rate table */}
      <div className="border-t border-gray-100 pt-3 space-y-0.5">
        <RateRow
          label="CTR (Impressions → Clics)"
          actual={ctr}
          benchmark={benchmarks.ctr}
          isGood={ctrOk}
          badge={!ctrOk ? '⚠️ Créatif' : undefined}
        />
        <RateRow
          label="CVR (Clics → Conversions)"
          actual={cvr}
          benchmark={benchmarks.cvr}
          isGood={cvrOk}
          badge={!cvrOk ? '⚠️ Landing' : undefined}
        />
        <div className="flex items-center justify-between pt-1 mt-1 border-t border-gray-100">
          <span className="text-xs text-gray-500">ROI net (marge 45%)</span>
          <span className={`text-xs font-bold font-mono ${roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}
