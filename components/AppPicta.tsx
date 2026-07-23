'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer,
} from 'recharts';
import type { AppInstallsResponse, AppDailyRow, AppCampaignSummary, AppTotals, AppVideoMetrics } from '@/types/app';

// ─── Config ───────────────────────────────────────────────────────────────────

const QUALITY_TARGET = 0.30;
const IOS_LAG_DAYS   = 3;
const IOS_DEVICES    = new Set(['mobile_phone_ios', 'ipad', 'iphone']);
const CAMP_COLORS    = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e'];

// ─── Mock data (dev offline fallback) ────────────────────────────────────────

function generateMockData(): AppInstallsResponse {
  const DAYS   = 30;
  const today  = new Date();
  const daily: AppDailyRow[] = [];
  const camps  = [
    { id: 'c1', name: 'Picta — App Install iOS',     status: 'ACTIVE', os: 'ios'     },
    { id: 'c2', name: 'Picta — App Install Android', status: 'ACTIVE', os: 'android' },
  ];

  for (let d = DAYS - 1; d >= 0; d--) {
    const dt = new Date(today);
    dt.setDate(today.getDate() - d);
    const date = dt.toISOString().split('T')[0];
    const rnd  = () => Math.random();

    // iOS
    const iosSpend = 150 + rnd() * 120;
    const iosImpr  = Math.round(iosSpend * 380 + rnd() * 8000);
    const iosCl    = Math.round(iosImpr * (0.013 + rnd() * 0.009));
    const iosInst  = Math.round(iosCl * (0.07 + rnd() * 0.06));
    const iosQI    = Math.round(iosInst * (0.18 + rnd() * 0.18));
    daily.push({ date, campaignId: 'c1', campaignName: camps[0].name, spend: iosSpend, impressions: iosImpr, reach: Math.round(iosImpr * 0.91), clicks: iosCl, frequency: 1.1 + rnd() * 0.5, installs: iosInst, qualifiedInstalls: iosQI });

    // Android
    const andSpend = 80 + rnd() * 70;
    const andImpr  = Math.round(andSpend * 560 + rnd() * 6000);
    const andCl    = Math.round(andImpr * (0.017 + rnd() * 0.011));
    const andInst  = Math.round(andCl * (0.10 + rnd() * 0.07));
    const andQI    = Math.round(andInst * (0.24 + rnd() * 0.16));
    daily.push({ date, campaignId: 'c2', campaignName: camps[1].name, spend: andSpend, impressions: andImpr, reach: Math.round(andImpr * 0.89), clicks: andCl, frequency: 1.0 + rnd() * 0.4, installs: andInst, qualifiedInstalls: andQI });
  }

  const toSummary = (c: typeof camps[0]): AppCampaignSummary => {
    const rows = daily.filter((r) => r.campaignId === c.id);
    const t = rows.reduce((acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, installs: acc.installs + r.installs, qualifiedInstalls: acc.qualifiedInstalls + r.qualifiedInstalls }), { spend: 0, impressions: 0, clicks: 0, installs: 0, qualifiedInstalls: 0 });
    return { id: c.id, name: c.name, status: c.status, os: c.os, ...t, cpi: t.installs > 0 ? t.spend / t.installs : 0, cpqi: t.qualifiedInstalls > 0 ? t.spend / t.qualifiedInstalls : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0, cpc: t.clicks > 0 ? t.spend / t.clicks : 0, installRate: t.clicks > 0 ? t.installs / t.clicks : 0, qualRate: t.installs > 0 ? t.qualifiedInstalls / t.installs : 0 };
  };

  const campaigns = camps.map(toSummary);
  const all = daily;
  const t = all.reduce((acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, installs: acc.installs + r.installs, qualifiedInstalls: acc.qualifiedInstalls + r.qualifiedInstalls }), { spend: 0, impressions: 0, clicks: 0, installs: 0, qualifiedInstalls: 0 });
  const totals: AppTotals = { ...t, cpi: t.installs > 0 ? t.spend / t.installs : 0, cpqi: t.qualifiedInstalls > 0 ? t.spend / t.qualifiedInstalls : 0, cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpc: t.clicks > 0 ? t.spend / t.clicks : 0, installRate: t.clicks > 0 ? t.installs / t.clicks : 0, qualRate: t.installs > 0 ? t.qualifiedInstalls / t.installs : 0 };
  const prevTotals: AppTotals = { ...totals, spend: totals.spend * 0.88, installs: Math.round(totals.installs * 0.82), qualifiedInstalls: Math.round(totals.qualifiedInstalls * 0.79), cpi: totals.cpi * 1.10, cpqi: totals.cpqi * 1.14, qualRate: totals.qualRate * 0.97 };

  const breakdown = daily.map((r) => ({
    date: r.date, campaignId: r.campaignId, campaignName: r.campaignName,
    device: r.campaignId === 'c1' ? 'mobile_phone_ios' : 'mobile_phone_android',
    spend: r.spend, impressions: r.impressions, clicks: r.clicks,
    installs: r.installs, qualifiedInstalls: r.qualifiedInstalls,
  }));

  const videoMetrics: AppVideoMetrics[] = [
    { campaignId: 'c1', campaignName: camps[0].name, os: 'ios',     videoPlays: 28500, avgTimeWatched: 10.5, p25Rate: 0.78, p50Rate: 0.58, p75Rate: 0.38, p100Rate: 0.21 },
    { campaignId: 'c2', campaignName: camps[1].name, os: 'android', videoPlays: 19200, avgTimeWatched: 7.8,  p25Rate: 0.72, p50Rate: 0.51, p75Rate: 0.31, p100Rate: 0.16 },
  ];

  return { daily, campaigns, totals, prevTotals, qualifiedInstallEvent: 'app_custom_event.fb_mobile_activate_app (mock)', breakdown, videoMetrics };
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Granularity = 'day' | 'week';
type OsFilter    = 'all' | 'ios' | 'android';
type SortDir     = 'asc' | 'desc';

interface DailyPoint {
  date: string;
  displayDate: string;
  spend: number;
  impressions: number;
  clicks: number;
  installs: number;
  qualifiedInstalls: number;
  nonQiInstalls: number;
  cpi: number;
  cpqi: number;
  cpm: number;
  ctr: number;
  installRate: number;
  qualRate: number;
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function fmtDisplayDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function recomputeTotals(daily: AppDailyRow[]): AppTotals {
  const t = daily.reduce(
    (acc, r) => ({ spend: acc.spend + r.spend, impressions: acc.impressions + r.impressions, clicks: acc.clicks + r.clicks, installs: acc.installs + r.installs, qualifiedInstalls: acc.qualifiedInstalls + r.qualifiedInstalls }),
    { spend: 0, impressions: 0, clicks: 0, installs: 0, qualifiedInstalls: 0 },
  );
  return { ...t, cpi: t.installs > 0 ? t.spend / t.installs : 0, cpqi: t.qualifiedInstalls > 0 ? t.spend / t.qualifiedInstalls : 0, cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpc: t.clicks > 0 ? t.spend / t.clicks : 0, installRate: t.clicks > 0 ? t.installs / t.clicks : 0, qualRate: t.installs > 0 ? t.qualifiedInstalls / t.installs : 0 };
}

function deriveMetrics(t: { spend: number; impressions: number; clicks: number; installs: number; qualifiedInstalls: number }) {
  return {
    cpi:         t.installs > 0          ? t.spend / t.installs          : 0,
    cpqi:        t.qualifiedInstalls > 0 ? t.spend / t.qualifiedInstalls : 0,
    cpm:         t.impressions > 0       ? (t.spend / t.impressions) * 1000 : 0,
    ctr:         t.impressions > 0       ? t.clicks / t.impressions       : 0,
    installRate: t.clicks > 0            ? t.installs / t.clicks          : 0,
    qualRate:    t.installs > 0          ? t.qualifiedInstalls / t.installs : 0,
    nonQiInstalls: Math.max(0, t.installs - t.qualifiedInstalls),
  };
}

function aggregateByDate(rows: AppDailyRow[]): DailyPoint[] {
  const map = new Map<string, { spend: number; impressions: number; clicks: number; installs: number; qualifiedInstalls: number }>();
  for (const r of rows) {
    const e = map.get(r.date);
    if (!e) map.set(r.date, { spend: r.spend, impressions: r.impressions, clicks: r.clicks, installs: r.installs, qualifiedInstalls: r.qualifiedInstalls });
    else { e.spend += r.spend; e.impressions += r.impressions; e.clicks += r.clicks; e.installs += r.installs; e.qualifiedInstalls += r.qualifiedInstalls; }
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({ date, displayDate: fmtDisplayDate(date), ...t, ...deriveMetrics(t) }));
}

function toWeekly(points: DailyPoint[]): DailyPoint[] {
  const weeks = new Map<string, { spend: number; impressions: number; clicks: number; installs: number; qualifiedInstalls: number; displayDate: string }>();
  for (const p of points) {
    const d = new Date(p.date + 'T12:00:00');
    const dow = d.getDay();
    const mon = new Date(d);
    mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const wk = mon.toISOString().split('T')[0];
    const e = weeks.get(wk);
    const disp = `S ${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    if (!e) weeks.set(wk, { spend: p.spend, impressions: p.impressions, clicks: p.clicks, installs: p.installs, qualifiedInstalls: p.qualifiedInstalls, displayDate: disp });
    else { e.spend += p.spend; e.impressions += p.impressions; e.clicks += p.clicks; e.installs += p.installs; e.qualifiedInstalls += p.qualifiedInstalls; }
  }
  return Array.from(weeks.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({ date, ...t, ...deriveMetrics(t) }));
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtMoney(v: number):   string { return v === 0 ? '—' : `$${v.toFixed(2)}`; }
function fmtNum(v: number):     string { return v === 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`; }
function fmtPct(v: number):     string { return `${(v * 100).toFixed(1)}%`; }
function fmtPctFine(v: number): string { return `${(v * 100).toFixed(2)}%`; }

// ─── Last-value label (for per-campaign charts) ───────────────────────────────

function makeLastLabel(total: number, color: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function LastLabel(props: any) {
    if (props.index !== total - 1 || typeof props.value !== 'number' || props.value === 0) return null;
    return (
      <text x={props.x + 8} y={props.y + 4} fill={color} fontSize={11} fontWeight={700}>
        ${props.value.toFixed(0)}
      </text>
    );
  };
}

// ─── Shared chart props ───────────────────────────────────────────────────────

const AXIS_TICK = { fontSize: 11, fill: '#9CA3AF' };
const AXIS_COMMON = { axisLine: false as const, tickLine: false as const, tick: AXIS_TICK };

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-6 py-4">{children}</div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, prevValue, display, lowerIsBetter = false }: {
  label: string; value: number; prevValue: number | null;
  display: string; lowerIsBetter?: boolean;
}) {
  const delta = prevValue != null && Math.abs(prevValue) > 0 ? (value - prevValue) / Math.abs(prevValue) : null;
  const good  = delta === null ? null : lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 min-w-0">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1 truncate">{label}</p>
      <p className="text-lg font-bold text-gray-900 font-mono">{display}</p>
      {delta !== null && (
        <p className={`text-[11px] mt-1 font-medium ${good ? 'text-green-600' : 'text-red-500'}`}>
          {delta > 0 ? '↑' : '↓'} {Math.abs(delta * 100).toFixed(1)}% vs préc.
        </p>
      )}
    </div>
  );
}

// ─── Tooltip components ───────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; color: string; payload: DailyPoint }[];
  label?: string;
}

function MoneyTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none text-xs">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono font-semibold">{fmtMoney(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function PctTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none text-xs">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span className="font-mono font-semibold">{fmtPct(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function VolumeTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 pointer-events-none text-xs space-y-0.5">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      <p className="text-blue-500">Installs : <span className="font-mono font-semibold text-gray-900">{fmtNum(p?.installs ?? 0)}</span></p>
      <p className="text-green-500">Dont QI : <span className="font-mono font-semibold text-gray-900">{fmtNum(p?.qualifiedInstalls ?? 0)}</span></p>
    </div>
  );
}

// ─── SVG Funnel ───────────────────────────────────────────────────────────────

function AppFunnel({ impressions, clicks, installs, qualInstalls }: {
  impressions: number; clicks: number; installs: number; qualInstalls: number;
}) {
  const W      = 500;
  const STEP_H = 60;
  const GAP_H  = 42;
  const PAD    = 8;
  const mx     = W / 2;

  function fw(val: number, max: number, minF = 0.15): number {
    if (!max || !val) return W * minF;
    return W * Math.min(Math.max(minF, minF + (1 - minF) * Math.sqrt(val / max)), 0.95);
  }
  function poly(yTop: number, wT: number, wB: number): string {
    const l = (W - wT) / 2, r = (W + wT) / 2;
    const lb = (W - wB) / 2, rb = (W + wB) / 2;
    return `${l},${yTop} ${r},${yTop} ${rb},${yTop + STEP_H} ${lb},${yTop + STEP_H}`;
  }

  const w1 = fw(impressions, impressions, 0.93);
  const w2 = fw(clicks,      impressions, 0.18);
  const w3 = fw(installs,    impressions, 0.12);
  const w4 = fw(qualInstalls, impressions, 0.08);

  const y1 = PAD;
  const y2 = y1 + STEP_H + GAP_H;
  const y3 = y2 + STEP_H + GAP_H;
  const y4 = y3 + STEP_H + GAP_H;
  const totalH = y4 + STEP_H + PAD;

  const ctr         = impressions > 0 ? clicks / impressions       : 0;
  const installRate = clicks > 0      ? installs / clicks           : 0;
  const qualRate    = installs > 0    ? qualInstalls / installs     : 0;

  const fmtBig = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : `${Math.round(v)}`;

  const gapLabel = (gy: number, rate: number, label: string, ok: boolean) => (
    <>
      <line x1={mx} y1={gy} x2={mx} y2={gy + GAP_H - 2} stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="3,3" />
      <polygon points={`${mx - 5},${gy + GAP_H - 10} ${mx + 5},${gy + GAP_H - 10} ${mx},${gy + GAP_H - 2}`} fill="#d1d5db" />
      <rect x={mx - 58} y={gy + 8} width={116} height={26} rx={13} fill={ok ? '#d1fae5' : '#fff7ed'} />
      <text x={mx} y={gy + 26} textAnchor="middle" fill={ok ? '#065f46' : '#9a3412'} fontSize={11} fontWeight="700">
        {label} {fmtPct(rate)}
      </text>
    </>
  );

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full mx-auto" style={{ maxHeight: 360 }}>
      <polygon points={poly(y1, w1, w2)} fill="#3b82f6" />
      <text x={mx} y={y1 + 19} textAnchor="middle" fill="white" fontSize={10} opacity={0.85}>Impressions</text>
      <text x={mx} y={y1 + 46} textAnchor="middle" fill="white" fontSize={18} fontWeight="700">{fmtBig(impressions)}</text>

      {gapLabel(y1 + STEP_H, ctr, 'CTR', ctr > 0.01)}

      <polygon points={poly(y2, w2, w3)} fill="#6366f1" />
      <text x={mx} y={y2 + 19} textAnchor="middle" fill="white" fontSize={10} opacity={0.85}>Clics</text>
      <text x={mx} y={y2 + 46} textAnchor="middle" fill="white" fontSize={18} fontWeight="700">{fmtBig(clicks)}</text>

      {gapLabel(y2 + STEP_H, installRate, 'Taux install', installRate > 0.05)}

      <polygon points={poly(y3, w3, w4)} fill="#10b981" />
      <text x={mx} y={y3 + 19} textAnchor="middle" fill="white" fontSize={10} opacity={0.85}>Installs</text>
      <text x={mx} y={y3 + 46} textAnchor="middle" fill="white" fontSize={18} fontWeight="700">{fmtBig(installs)}</text>

      {gapLabel(y3 + STEP_H, qualRate, 'Taux QI', qualRate >= QUALITY_TARGET)}

      <polygon points={poly(y4, w4, w4 * 0.95)} fill={qualRate >= QUALITY_TARGET ? '#059669' : '#f59e0b'} />
      <text x={mx} y={y4 + 19} textAnchor="middle" fill="white" fontSize={10} opacity={0.85}>Installs qualifiées</text>
      <text x={mx} y={y4 + 46} textAnchor="middle" fill="white" fontSize={18} fontWeight="700">{fmtBig(qualInstalls)}</text>
    </svg>
  );
}

// ─── Campaign table ───────────────────────────────────────────────────────────

type SortKey = keyof AppCampaignSummary;

function CampaignTable({ campaigns, sortKey, sortDir, onSort }: {
  campaigns: AppCampaignSummary[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const cols: { key: SortKey; label: string; fmt: (v: AppCampaignSummary) => string }[] = [
    { key: 'name',              label: 'Campagne',       fmt: (c) => c.name },
    { key: 'status',            label: 'Statut',         fmt: (c) => c.status },
    { key: 'spend',             label: 'Dépenses',       fmt: (c) => `$${c.spend.toFixed(0)}` },
    { key: 'installs',          label: 'Installs',       fmt: (c) => fmtNum(c.installs) },
    { key: 'qualifiedInstalls', label: 'QI',             fmt: (c) => fmtNum(c.qualifiedInstalls) },
    { key: 'cpi',               label: 'CPI',            fmt: (c) => c.cpi > 0 ? fmtMoney(c.cpi) : '—' },
    { key: 'cpqi',              label: 'CPQI',           fmt: (c) => c.cpqi > 0 ? fmtMoney(c.cpqi) : '—' },
    { key: 'ctr',               label: 'CTR',            fmt: (c) => fmtPctFine(c.ctr) },
    { key: 'cpm',               label: 'CPM',            fmt: (c) => fmtMoney(c.cpm) },
    { key: 'installRate',       label: 'Taux install',   fmt: (c) => fmtPct(c.installRate) },
    { key: 'qualRate',          label: 'Taux QI',        fmt: (c) => fmtPct(c.qualRate) },
  ];

  if (!campaigns.length) return <p className="text-sm text-gray-400 py-6 text-center">Aucune campagne app trouvée.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            {cols.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 whitespace-nowrap select-none"
              >
                {c.label}
                {sortKey === c.key && <span className="ml-1 text-blue-500">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((camp, i) => (
            <tr key={camp.id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
              {cols.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 font-mono ${c.key === 'name' ? 'font-sans text-gray-800 font-medium max-w-[220px]' : 'text-gray-700'}`}>
                  {c.key === 'status' ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${camp.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {camp.status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />}
                      {camp.status}
                    </span>
                  ) : c.key === 'name' ? (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="flex-shrink-0 text-sm">{camp.os === 'ios' ? '🍎' : camp.os === 'android' ? '🤖' : '🍎🤖'}</span>
                      <span className="truncate">{camp.name}</span>
                    </span>
                  ) : c.fmt(camp)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Loading / Error states ───────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
      <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm">Chargement des données app…</p>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
      <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex-1">
        <p className="font-semibold">Erreur App Picta</p>
        <p className="text-red-600 mt-0.5">{message}</p>
      </div>
      <button onClick={onRetry} className="text-xs font-medium underline hover:no-underline">Réessayer</button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AppPicta({ datePreset }: { datePreset: string }) {
  const [data,        setData]        = useState<AppInstallsResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [osFilter,    setOsFilter]    = useState<OsFilter>('all');
  const [sortKey,     setSortKey]     = useState<SortKey>('spend');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/app-installs?date_preset=${datePreset}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if ('error' in json && typeof json.error === 'string') throw new Error(json.error);
      setData(json as AppInstallsResponse);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      console.warn('[AppPicta] Utilisation des données mock :', msg);
      setError(msg);
      setData(generateMockData());
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // OS counts from campaign targeting (source of truth from Meta)
  const osCounts = useMemo(() => {
    if (!data) return { ios: 0, android: 0 };
    return data.campaigns.reduce(
      (acc, c) => {
        if (c.os === 'ios' || c.os === 'both') acc.ios++;
        if (c.os === 'android' || c.os === 'both') acc.android++;
        return acc;
      },
      { ios: 0, android: 0 },
    );
  }, [data]);

  // Filter by OS using campaign targeting (user_os) — reliable regardless of delivery device strings
  const filteredData = useMemo(() => {
    if (!data) return null;
    if (osFilter === 'all') return data;
    const isIos     = osFilter === 'ios';
    const campaigns = data.campaigns.filter((c) => isIos ? (c.os === 'ios' || c.os === 'both') : (c.os === 'android' || c.os === 'both'));
    const campIds     = new Set(campaigns.map((c) => c.id));
    const daily       = data.daily.filter((r) => campIds.has(r.campaignId));
    const videoMetrics = (data.videoMetrics ?? []).filter((v) => campIds.has(v.campaignId));
    return { ...data, campaigns, daily, totals: recomputeTotals(daily), prevTotals: null, videoMetrics };
  }, [data, osFilter]);

  const dailyPoints = useMemo<DailyPoint[]>(() => {
    if (!filteredData) return [];
    const byDate = aggregateByDate(filteredData.daily);
    return granularity === 'week' ? toWeekly(byDate) : byDate;
  }, [filteredData, granularity]);

  const sortedCampaigns = useMemo(() => {
    if (!filteredData) return [];
    return [...filteredData.campaigns].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [filteredData, sortKey, sortDir]);

  // Per-campaign bar (chart 8)
  const campaignBars = useMemo(() => {
    if (!filteredData) return [];
    return filteredData.campaigns.map((c) => ({
      name: c.name.replace(/picta\s*[—\-]\s*/i, '').replace(/app\s+install\s*/i, '').trim().slice(0, 18),
      CPI:  c.cpi,
      CPQI: c.cpqi,
      'Taux QI %': +(c.qualRate * 100).toFixed(1),
    }));
  }, [filteredData]);

  // Per-campaign daily CPI/CPQI series
  const perCampaignPoints = useMemo<Map<string, DailyPoint[]>>(() => {
    if (!filteredData) return new Map();
    const result = new Map<string, DailyPoint[]>();
    for (const camp of filteredData.campaigns) {
      const rows = filteredData.daily.filter((r) => r.campaignId === camp.id);
      result.set(camp.id, aggregateByDate(rows));
    }
    return result;
  }, [filteredData]);

  if (loading) return <LoadingState />;

  const active     = filteredData ?? data!;
  const { totals, prevTotals, qualifiedInstallEvent } = active;
  const noResults  = osFilter !== 'all' && active.campaigns.length === 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const filteredVideoMetrics = active.videoMetrics ?? [];

  const avgTimeData = [...filteredVideoMetrics]
    .sort((a, b) => b.avgTimeWatched - a.avgTimeWatched)
    .map((v) => ({
      name: v.campaignName.replace(/picta\s*[—\-]\s*/i, '').replace(/app\s+install\s*/i, '').trim().slice(0, 24),
      avgTime: +v.avgTimeWatched.toFixed(1),
      os: v.os,
    }));

  const retentionData = filteredVideoMetrics.length > 0 ? [
    { p: '25%',  ...Object.fromEntries(filteredVideoMetrics.map((v) => [v.campaignId, +(v.p25Rate  * 100).toFixed(1)])) },
    { p: '50%',  ...Object.fromEntries(filteredVideoMetrics.map((v) => [v.campaignId, +(v.p50Rate  * 100).toFixed(1)])) },
    { p: '75%',  ...Object.fromEntries(filteredVideoMetrics.map((v) => [v.campaignId, +(v.p75Rate  * 100).toFixed(1)])) },
    { p: '100%', ...Object.fromEntries(filteredVideoMetrics.map((v) => [v.campaignId, +(v.p100Rate * 100).toFixed(1)])) },
  ] : [];

  const kpis = [
    { label: 'Dépenses',       value: totals.spend,             prev: prevTotals?.spend,             display: `$${totals.spend.toFixed(0)}`,       lowerIsBetter: true  },
    { label: 'Installs',       value: totals.installs,          prev: prevTotals?.installs,          display: fmtNum(totals.installs),             lowerIsBetter: false },
    { label: 'Installs QI',    value: totals.qualifiedInstalls, prev: prevTotals?.qualifiedInstalls, display: fmtNum(totals.qualifiedInstalls),    lowerIsBetter: false },
    { label: 'CPI',            value: totals.cpi,               prev: prevTotals?.cpi,               display: totals.cpi > 0 ? fmtMoney(totals.cpi) : '—', lowerIsBetter: true },
    { label: 'CPQI',           value: totals.cpqi,              prev: prevTotals?.cpqi,              display: totals.cpqi > 0 ? fmtMoney(totals.cpqi) : '—', lowerIsBetter: true },
    { label: 'CPM',            value: totals.cpm,               prev: prevTotals?.cpm,               display: fmtMoney(totals.cpm),               lowerIsBetter: true  },
    { label: 'CTR',            value: totals.ctr,               prev: prevTotals?.ctr,               display: fmtPctFine(totals.ctr),             lowerIsBetter: false },
    { label: 'Taux install→QI',value: totals.qualRate,          prev: prevTotals?.qualRate,          display: fmtPct(totals.qualRate),            lowerIsBetter: false },
  ];

  return (
    <div className="space-y-6">

      {/* Error banner (data is mock) */}
      {error && <ErrorBanner message={`${error} — données de démonstration affichées`} onRetry={fetchData} />}

      {/* ── Sticky control bar ─────────────────────────────────────────────── */}
      <div className="sticky top-[121px] z-[9] -mx-6 px-6 py-2.5 bg-white border-b border-gray-100 shadow-sm flex flex-wrap items-center gap-3">

        {/* QI event label */}
        <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 font-mono hidden sm:inline">
          QI = {qualifiedInstallEvent}
        </span>

        <div className="ml-auto flex items-center gap-3">
          {/* OS filter */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
            {([
              ['all',     'Tous',         null],
              ['ios',     '🍎 iOS',       osCounts.ios],
              ['android', '🤖 Autre OS',  osCounts.android],
            ] as [OsFilter, string, number | null][]).map(([val, label, count]) => (
              <button
                key={val}
                onClick={() => setOsFilter(val)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                  osFilter === val
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {label}
                {count !== null && (
                  <span className={`text-[10px] rounded-full px-1.5 py-0.5 font-mono ${osFilter === val ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Granularity */}
          <div className="flex gap-0.5 bg-gray-100 rounded-lg p-1">
            {(['day', 'week'] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${granularity === g ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {g === 'day' ? 'Jour' : 'Semaine'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty state when OS filter finds nothing */}
      {noResults && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <p className="text-4xl">🔍</p>
          <p className="text-sm font-medium text-gray-600">Aucune campagne {osFilter === 'ios' ? 'iOS' : 'Android'} trouvée</p>
          <p className="text-xs text-center max-w-sm">
            Le filtre se base sur le ciblage OS (<span className="font-mono">user_os</span>) déclaré dans chaque campagne Meta.
            Aucune campagne de type <strong>{osFilter === 'ios' ? 'iOS' : 'Android'}</strong> n&apos;a été détectée dans votre compte.
          </p>
          <button onClick={() => setOsFilter('all')} className="mt-2 text-xs text-blue-600 underline hover:no-underline">
            Voir toutes les campagnes
          </button>
        </div>
      )}

      {!noResults && <>{/* 1. KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={k.value}
            prevValue={k.prev ?? null}
            display={k.display}
            lowerIsBetter={k.lowerIsBetter}
          />
        ))}
      </div>

      {/* 2 & 3. CPI vs CPQI | CPM */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="CPI vs CPQI" subtitle="Coût par install vs install qualifiée — l'écart = prime de qualité">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `$${v.toFixed(0)}`} {...AXIS_COMMON} width={46} />
              <Tooltip content={<MoneyTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="cpi"  name="CPI ($)"  stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="cpqi" name="CPQI ($)" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="5 3" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CPM" subtitle="Coût pour mille impressions — indicateur du coût média">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `$${v.toFixed(1)}`} {...AXIS_COMMON} width={46} />
              <Tooltip content={<MoneyTooltip />} />
              <Line type="monotone" dataKey="cpm" name="CPM ($)" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 4 & 5. CTR | Taux install→QI */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="CTR" subtitle="Qualité de l'accroche et de l'audience en haut du tunnel">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} {...AXIS_COMMON} width={52} />
              <Tooltip content={<PctTooltip />} />
              <Line type="monotone" dataKey="ctr" name="CTR" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Taux Install → QI" subtitle="Qualité du trafic acquis — ligne rouge = objectif">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} {...AXIS_COMMON} width={40} />
              <Tooltip content={<PctTooltip />} />
              <ReferenceLine
                y={QUALITY_TARGET}
                stroke="#ef4444"
                strokeDasharray="4 2"
                label={{ value: `Objectif ${(QUALITY_TARGET * 100).toFixed(0)}%`, position: 'insideTopRight', fontSize: 10, fill: '#ef4444' }}
              />
              <Line type="monotone" dataKey="qualRate" name="Taux QI" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 6. Funnel */}
      <ChartCard
        title="Tunnel de conversion"
        subtitle="Impressions → Clics → Installs → Installs qualifiées · volume + taux de passage"
      >
        <AppFunnel
          impressions={totals.impressions}
          clicks={totals.clicks}
          installs={totals.installs}
          qualInstalls={totals.qualifiedInstalls}
        />
      </ChartCard>

      {/* 7 & 8. Volume bar | Breakdown par campagne */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Volume Installs vs Installs qualifiées" subtitle="Stacked — vert = portion qualifiée">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis {...AXIS_COMMON} width={35} />
              <Tooltip content={<VolumeTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="nonQiInstalls"    name="Installs (hors QI)" fill="#93c5fd" stackId="a" radius={[0, 0, 0, 0]} />
              <Bar dataKey="qualifiedInstalls" name="Installs QI"        fill="#34d399" stackId="a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Comparatif par campagne" subtitle="CPI · CPQI par campagne (iOS vs Android, ou autre split)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={campaignBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(0)}`} {...AXIS_COMMON} />
              <YAxis dataKey="name" type="category" {...AXIS_COMMON} width={90} tick={{ ...AXIS_TICK, fontSize: 10 }} />
              <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `$${v.toFixed(2)}` : '—'} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="CPI"  fill="#3b82f6" radius={[0, 3, 3, 0]} />
              <Bar dataKey="CPQI" fill="#f97316" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* iOS / SKAdNetwork disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800 flex gap-2 items-start">
        <span className="mt-0.5">⚠️</span>
        <span>
          <strong>iOS / SKAdNetwork</strong> : les installs iOS des {IOS_LAG_DAYS} derniers jours sont incomplètes
          en raison de la fenêtre d&apos;attribution et de l&apos;agrégation SKAN. Ne pas les traiter comme définitives.
        </span>
      </div>

      {/* 9. Per-campaign CPI / CPQI charts — split iOS | Android */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">CPI vs CPQI par campagne</h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {(['ios', 'android'] as const).map((side) => {
            const sideLabel  = side === 'ios' ? '🍎 iOS' : '🤖 Android';
            const sideCamps  = (filteredData?.campaigns ?? []).filter((c) =>
              side === 'ios' ? (c.os === 'ios' || c.os === 'both') : (c.os !== 'ios'),
            );
            return (
              <div key={side} className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                  <span className="text-sm font-semibold text-gray-800">{sideLabel}</span>
                  <span className="text-xs text-gray-400 font-mono bg-gray-100 rounded-full px-2 py-0.5">{sideCamps.length}</span>
                </div>
                {sideCamps.length === 0 ? (
                  <p className="text-xs text-gray-400 py-4 text-center">Aucune campagne {side === 'ios' ? 'iOS' : 'Android'}</p>
                ) : sideCamps.map((camp) => {
                  const pts = granularity === 'week'
                    ? toWeekly(perCampaignPoints.get(camp.id) ?? [])
                    : (perCampaignPoints.get(camp.id) ?? []);
                  if (!pts.length) return null;
                  return (
                    <ChartCard key={camp.id} title={camp.name} subtitle="Coût/install vs coût/download qualifié">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={pts} margin={{ top: 4, right: 52, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                          <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
                          <YAxis tickFormatter={(v) => `$${(v as number).toFixed(0)}`} {...AXIS_COMMON} width={46} />
                          <Tooltip content={<MoneyTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line type="monotone" dataKey="cpi" name="Coût / install ($)" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: '#3b82f6' }} label={makeLastLabel(pts.length, '#3b82f6')} />
                          <Line type="monotone" dataKey="cpqi" name="Coût / download qualifié ($)" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} label={makeLastLabel(pts.length, '#ef4444')} />
                        </LineChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* 10. Campaign table */}
      <ChartCard title="Tableau par campagne" subtitle="Cliquer sur un en-tête pour trier">
        <CampaignTable
          campaigns={sortedCampaigns}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
        />
      </ChartCard>

      {/* 11. Video metrics */}
      {filteredVideoMetrics.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Vidéo — Temps & taux de complétion</h3>
            <span className="text-xs text-gray-400 font-mono bg-gray-100 rounded-full px-2 py-0.5">{filteredVideoMetrics.length} campagnes</span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Avg time watched */}
            <ChartCard title="Temps moyen de visionnage" subtitle="Secondes regardées en moyenne par vue · 🍎 bleu, 🤖 vert">
              <ResponsiveContainer width="100%" height={Math.max(180, filteredVideoMetrics.length * 44)}>
                <BarChart data={avgTimeData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${v}s`} {...AXIS_COMMON} />
                  <YAxis dataKey="name" type="category" {...AXIS_COMMON} width={120} tick={{ ...AXIS_TICK, fontSize: 10 }} />
                  <Tooltip formatter={(v: unknown) => typeof v === 'number' ? [`${v.toFixed(1)}s`, 'Temps moyen'] : '—'} />
                  <Bar dataKey="avgTime" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 10, formatter: (v: unknown) => typeof v === 'number' ? `${v}s` : '' }}>
                    {avgTimeData.map((entry, i) => (
                      <Cell key={i} fill={entry.os === 'ios' ? '#3b82f6' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Retention curve */}
            <ChartCard title="Courbe de rétention vidéo" subtitle="% des vues ayant atteint chaque seuil de complétion">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={retentionData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="p" {...AXIS_COMMON} />
                  <YAxis tickFormatter={(v) => `${v}%`} {...AXIS_COMMON} width={40} domain={[0, 100]} />
                  <Tooltip formatter={(v: unknown) => typeof v === 'number' ? [`${v.toFixed(1)}%`, ''] : '—'} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {filteredVideoMetrics.map((v, i) => (
                    <Line
                      key={v.campaignId}
                      type="monotone"
                      dataKey={v.campaignId}
                      name={v.campaignName.replace(/picta\s*[—\-]\s*/i, '').replace(/app\s+install\s*/i, '').trim().slice(0, 20)}
                      stroke={CAMP_COLORS[i % CAMP_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      )}
    </>}
    </div>
  );
}
