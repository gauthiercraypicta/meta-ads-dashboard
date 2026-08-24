'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import type { AdjustResponse, AdjustDailyRow, AdjustCampaignSummary } from '@/types/adjust';

// ─── Config ───────────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e'];

const EXCLUDED_CAMPAIGN_IDS = new Set(['52683015717217']);

function isGenericCampaign(name: string): boolean {
  return name.toLowerCase().includes('generic');
}

// Strips platform/channel/variant words so Landing↔Web and _perf renames still match
function normCampName(name: string): string {
  return name.toLowerCase()
    .replace(/landing|web|ios|android|perf|performance|v\d+|new|old|test/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

// ─── Mock data ────────────────────────────────────────────────────────────────

function generateMock(): AdjustResponse {
  const today = new Date();
  const DAYS  = 30;
  const apps  = [{ token: 'iosapp1', name: 'Picta iOS' }, { token: 'andapp1', name: 'Picta Android' }];
  const campaigns = [
    { token: '11111111', name: 'UA_iOS_Broad',       appToken: 'iosapp1', appName: 'Picta iOS' },
    { token: '22222222', name: 'UA_iOS_Retarget',     appToken: 'iosapp1', appName: 'Picta iOS' },
    { token: '33333333', name: 'UA_Android_Broad',    appToken: 'andapp1', appName: 'Picta Android' },
    { token: '44444444', name: 'UA_Android_Retarget', appToken: 'andapp1', appName: 'Picta Android' },
  ];
  const daily: AdjustDailyRow[] = [];
  for (let d = DAYS - 1; d >= 0; d--) {
    const dt = new Date(today); dt.setDate(today.getDate() - d);
    const date = dt.toISOString().split('T')[0];
    for (const c of campaigns) {
      const ios = c.appToken === 'iosapp1';
      const cost = ios ? 80 + Math.random() * 60 : 50 + Math.random() * 40;
      const impressions = Math.round(cost * (ios ? 420 : 600) + Math.random() * 5000);
      const clicks = Math.round(impressions * (0.012 + Math.random() * 0.008));
      const installs = Math.round(clicks * (0.06 + Math.random() * 0.05));
      const engagement  = Math.round(installs * (0.55 + Math.random() * 0.3));
      const cartAdd     = Math.round(engagement * (0.4 + Math.random() * 0.2));
      const checkout    = Math.round(cartAdd    * (0.5 + Math.random() * 0.2));
      const orderPlace  = Math.round(checkout   * (0.6 + Math.random() * 0.2));
      const timeSpent   = Math.round(installs   * (120  + Math.random() * 180));
      const productDetailOpen = Math.round(engagement * (0.6 + Math.random() * 0.25));
      const cartAddUnique     = Math.round(cartAdd    * (0.7 + Math.random() * 0.2));
      const checkoutUnique    = Math.round(checkout   * (0.7 + Math.random() * 0.2));
      const orderPlaceUnique  = Math.round(orderPlace * (0.7 + Math.random() * 0.2));
      const productDetailOpenUnique = Math.round(productDetailOpen * (0.7 + Math.random() * 0.2));
      daily.push({ date, appToken: c.appToken, appName: c.appName, campaignToken: c.token, campaignName: c.name, installs, clicks, impressions, cost, sessions: Math.round(installs * (2 + Math.random() * 3)), engagement, cartAdd, checkout, orderPlace, timeSpent, productDetailOpen, cartAddUnique, checkoutUnique, orderPlaceUnique, productDetailOpenUnique });
    }
  }
  const ZERO_EXTRA = { productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0, orderPlaceUnique: 0, productDetailOpenUnique: 0 };
  const campSummary: AdjustCampaignSummary[] = campaigns.map((c) => {
    const rows = daily.filter((r) => r.campaignToken === c.token);
    const t = rows.reduce((a, r) => ({ installs: a.installs + r.installs, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, cost: a.cost + r.cost, sessions: a.sessions + r.sessions, engagement: a.engagement + r.engagement, cartAdd: a.cartAdd + r.cartAdd, checkout: a.checkout + r.checkout, orderPlace: a.orderPlace + r.orderPlace, timeSpent: a.timeSpent + r.timeSpent, productDetailOpen: a.productDetailOpen + r.productDetailOpen, cartAddUnique: a.cartAddUnique + r.cartAddUnique, checkoutUnique: a.checkoutUnique + r.checkoutUnique, orderPlaceUnique: a.orderPlaceUnique + r.orderPlaceUnique, productDetailOpenUnique: a.productDetailOpenUnique + r.productDetailOpenUnique }), { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0, engagement: 0, cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0, ...ZERO_EXTRA });
    return { token: c.token, name: c.name, appName: c.appName, ...t, cpi: t.installs > 0 ? t.cost / t.installs : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0, cpiEngagement: t.engagement > 0 ? t.cost / t.engagement : 0 };
  });
  const t = daily.reduce((a, r) => ({ installs: a.installs + r.installs, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, cost: a.cost + r.cost, sessions: a.sessions + r.sessions, engagement: a.engagement + r.engagement, cartAdd: a.cartAdd + r.cartAdd, checkout: a.checkout + r.checkout, orderPlace: a.orderPlace + r.orderPlace, timeSpent: a.timeSpent + r.timeSpent, productDetailOpen: a.productDetailOpen + r.productDetailOpen, cartAddUnique: a.cartAddUnique + r.cartAddUnique, checkoutUnique: a.checkoutUnique + r.checkoutUnique, orderPlaceUnique: a.orderPlaceUnique + r.orderPlaceUnique, productDetailOpenUnique: a.productDetailOpenUnique + r.productDetailOpenUnique }), { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0, engagement: 0, cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0, ...ZERO_EXTRA });
  const totals = { ...t, cpi: t.installs > 0 ? t.cost / t.installs : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0, cpiEngagement: t.engagement > 0 ? t.cost / t.engagement : 0 };
  const prevTotals = { ...totals, installs: Math.round(totals.installs * 0.85), cost: totals.cost * 0.9, engagement: Math.round(totals.engagement * 0.82), cpi: totals.cpi * 1.1, ctr: totals.ctr * 0.97, cpm: totals.cpm * 1.05, cpiEngagement: totals.cpiEngagement * 1.08, sessions: Math.round(totals.sessions * 0.82), cartAdd: Math.round(totals.cartAdd * 0.80), checkout: Math.round(totals.checkout * 0.80), orderPlace: Math.round(totals.orderPlace * 0.80), timeSpent: totals.timeSpent * 0.95, productDetailOpen: Math.round(totals.productDetailOpen * 0.80), cartAddUnique: Math.round(totals.cartAddUnique * 0.80), checkoutUnique: Math.round(totals.checkoutUnique * 0.80), orderPlaceUnique: Math.round(totals.orderPlaceUnique * 0.80), productDetailOpenUnique: Math.round(totals.productDetailOpenUnique * 0.80) };
  const genericPrevTotals   = { ...prevTotals, installs: Math.round(prevTotals.installs * 0.5), cost: prevTotals.cost * 0.5, engagement: Math.round(prevTotals.engagement * 0.5), cpi: prevTotals.cpi * 1.05, cpiEngagement: prevTotals.cpiEngagement * 1.05 };
  const iconicPrevTotals    = { ...prevTotals, installs: Math.round(prevTotals.installs * 0.2), cost: prevTotals.cost * 0.2, engagement: Math.round(prevTotals.engagement * 0.2), cpi: prevTotals.cpi * 0.95, cpiEngagement: prevTotals.cpiEngagement * 0.95 };
  const otherPaidPrevTotals = { ...prevTotals, installs: Math.round(prevTotals.installs * 0.3), cost: prevTotals.cost * 0.3, engagement: Math.round(prevTotals.engagement * 0.3), cpi: prevTotals.cpi * 1.02, cpiEngagement: prevTotals.cpiEngagement * 1.02 };
  const noncampPrevTotals   = { ...prevTotals, installs: Math.round(prevTotals.installs * 0.15), cost: 0, engagement: Math.round(prevTotals.engagement * 0.1), cpi: 0, cpiEngagement: 0 };
  return { daily, campaigns: campSummary, totals, prevTotals, genericPrevTotals, iconicPrevTotals, otherPaidPrevTotals, noncampPrevTotals, apps, currency: 'USD' };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtMoney = (v: number | string | null | undefined) => { const n = Number(v ?? 0); return (isNaN(n) || n === 0) ? '—' : `$${n.toFixed(2)}`; };
const fmtNum   = (v: number | string | null | undefined) => { const n = Number(v ?? 0); return (isNaN(n) || n === 0) ? '—' : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`; };
const fmtPct   = (v: number | string | null | undefined) => `${(Number(v ?? 0) * 100).toFixed(1)}%`;
const fmtDate  = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ─── Chart helpers ────────────────────────────────────────────────────────────

type Granularity = 'day' | 'week';

interface DailyPoint {
  date: string;
  displayDate: string;
  installs: number;
  nonEngaged: number;
  clicks: number;
  impressions: number;
  cost: number;
  sessions: number;
  engagement: number;
  engagementRate: number;
  installRate: number;  // installs / clicks
  cpi: number;
  ctr: number;
  cpm: number;
  cpiEngagement: number;
}

type DayAcc = { installs: number; clicks: number; impressions: number; cost: number; sessions: number; engagement: number };

function aggregateByDate(rows: AdjustDailyRow[]): DailyPoint[] {
  const map = new Map<string, DayAcc>();
  for (const r of rows) {
    const e = map.get(r.date);
    if (!e) map.set(r.date, { installs: r.installs, clicks: r.clicks, impressions: r.impressions, cost: r.cost, sessions: r.sessions, engagement: r.engagement });
    else { e.installs += r.installs; e.clicks += r.clicks; e.impressions += r.impressions; e.cost += r.cost; e.sessions += r.sessions; e.engagement += r.engagement; }
  }
  return Array.from(map.entries())
    .filter(([, t]) => t.installs > 0 || t.cost > 0 || t.clicks > 0 || t.impressions > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, t]) => ({
      date, displayDate: fmtDate(date), ...t,
      nonEngaged:     Math.max(0, t.installs - t.engagement),
      engagementRate: t.installs > 0 ? t.engagement / t.installs : 0,
      installRate:    t.clicks   > 0 ? t.installs   / t.clicks   : 0,
      cpi:            t.installs   > 0 ? t.cost / t.installs    : 0,
      ctr:            t.impressions > 0 ? t.clicks / t.impressions : 0,
      cpm:            t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
      cpiEngagement:  t.engagement > 0  ? t.cost / t.engagement  : 0,
    }));
}

function toWeekly(pts: DailyPoint[]): DailyPoint[] {
  const weeks = new Map<string, DayAcc & { displayDate: string }>();
  for (const p of pts) {
    const d = new Date(p.date + 'T12:00:00');
    const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const wk = mon.toISOString().split('T')[0];
    const disp = `S ${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    const e = weeks.get(wk);
    if (!e) weeks.set(wk, { installs: p.installs, clicks: p.clicks, impressions: p.impressions, cost: p.cost, sessions: p.sessions, engagement: p.engagement, displayDate: disp });
    else { e.installs += p.installs; e.clicks += p.clicks; e.impressions += p.impressions; e.cost += p.cost; e.sessions += p.sessions; e.engagement += p.engagement; }
  }
  return Array.from(weeks.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({
    date, ...t,
    nonEngaged:     Math.max(0, t.installs - t.engagement),
    engagementRate: t.installs > 0 ? t.engagement / t.installs : 0,
    installRate:    t.clicks   > 0 ? t.installs   / t.clicks   : 0,
    cpi:            t.installs   > 0 ? t.cost / t.installs    : 0,
    ctr:            t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpm:            t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
    cpiEngagement:  t.engagement > 0  ? t.cost / t.engagement  : 0,
  }));
}

function meanOf(pts: DailyPoint[], key: keyof DailyPoint): number {
  if (!pts.length) return 0;
  return pts.reduce((s, p) => s + (p[key] as number), 0) / pts.length;
}

// ─── Shared chart props ───────────────────────────────────────────────────────

const AXIS_TICK   = { fontSize: 11, fill: '#9CA3AF' };
const AXIS_COMMON = { axisLine: false as const, tickLine: false as const, tick: AXIS_TICK };
const REFLINE_STYLE = { stroke: '#CBD5E1', strokeDasharray: '4 2', strokeWidth: 1 as const };

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

function KpiCard({ label, value, prevValue, display, lowerIsBetter = false }: { label: string; value: number; prevValue: number | null; display: string; lowerIsBetter?: boolean }) {
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

// Tooltip type that matches recharts payload shape (readonly to match recharts ContentType)
interface TtItem { name: string; value: number | null; color: string; dataKey: string }
interface TtProps { active?: boolean; payload?: readonly TtItem[]; label?: string | number }

function MoneyTooltip({ active, payload, label }: TtProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs pointer-events-none">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span><span className="font-mono font-semibold">{fmtMoney(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function NumTooltip({ active, payload, label }: TtProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs pointer-events-none">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span><span className="font-mono font-semibold">{fmtNum(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function PctTooltip({ active, payload, label }: TtProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs pointer-events-none">
      <p className="font-semibold text-gray-900 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span><span className="font-mono font-semibold">{fmtPct(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

// Pill-style legend for campaign charts — active campaigns are solid colored pills,
// hidden ones become outlined "+ Restore" pills on the left
function CampLegend({ keys, hidden, onToggle, colors }: {
  keys: string[];
  hidden: Set<string>;
  onToggle: (k: string) => void;
  colors: string[];
}) {
  const visibleKeys = keys.filter((k) => !hidden.has(k));
  const hiddenKeys  = keys.filter((k) =>  hidden.has(k));
  return (
    <div className="flex flex-wrap gap-2 mt-4 items-center px-1">
      {/* Outlined pills for hidden campaigns (click to restore) */}
      {hiddenKeys.map((key) => {
        const i = keys.indexOf(key);
        const color = colors[i % colors.length];
        return (
          <button key={key} onClick={() => onToggle(key)} title={`Afficher ${key}`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium border-2 bg-white transition-all hover:bg-gray-50"
            style={{ borderColor: color, color }}>
            <span className="text-base leading-none" style={{ color }}>+</span>
            <span className="max-w-[110px] truncate">{key}</span>
          </button>
        );
      })}

      {/* Separator dot when both sections have items */}
      {hiddenKeys.length > 0 && visibleKeys.length > 0 && (
        <span className="text-gray-300 text-xs select-none">·</span>
      )}

      {/* Solid pills for visible campaigns (click to hide) */}
      {visibleKeys.map((key) => {
        const i = keys.indexOf(key);
        const color = colors[i % colors.length];
        return (
          <button key={key} onClick={() => onToggle(key)} title={`Masquer ${key}`}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold text-white transition-all hover:opacity-80"
            style={{ backgroundColor: color }}>
            {/* Line style indicator */}
            <span className="inline-block w-4 h-px rounded" style={{ backgroundColor: 'rgba(255,255,255,0.7)' }} />
            <span className="max-w-[110px] truncate">{key}</span>
            <span className="opacity-70 leading-none text-sm">×</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Campaign table ───────────────────────────────────────────────────────────

type SortKey = keyof AdjustCampaignSummary;
type SortDir = 'asc' | 'desc';

interface ColDef {
  key?: SortKey;
  label: string;
  fmt: (c: AdjustCampaignSummary) => React.ReactNode;
}

function CampaignTable({ campaigns, sortKey, sortDir, onSort }: {
  campaigns: AdjustCampaignSummary[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const cols: ColDef[] = [
    // ── Identity ──────────────────────────────────────────────────────────────
    { key: 'name',       label: 'Campagne',         fmt: (c) => c.name.replace(/[_\s]+\d{6,}$/, '') },
    { key: 'appName',    label: 'App',               fmt: (c) => c.appName },
    // ── Top of funnel ─────────────────────────────────────────────────────────
    { key: 'impressions', label: 'Impressions',      fmt: (c) => fmtNum(c.impressions) },
    { key: 'cpm',         label: 'CPM',              fmt: (c) => c.impressions > 0 ? fmtMoney(c.cpm) : '—' },
    { key: 'clicks',      label: 'Clics',            fmt: (c) => fmtNum(c.clicks) },
    { key: 'ctr',         label: 'CTR (Clic/Impr.)', fmt: (c) => c.impressions > 0 ? fmtPct(c.ctr) : '—' },
    // ── Install ───────────────────────────────────────────────────────────────
    { key: 'installs',    label: 'Installs',         fmt: (c) => fmtNum(c.installs) },
    {                     label: 'DL/Clic',          fmt: (c) => c.clicks > 0 ? `${(c.installs / c.clicks * 100).toFixed(1)}%` : '—' },
    // ── Engagement ────────────────────────────────────────────────────────────
    { key: 'engagement',  label: 'Qualifiés',        fmt: (c) => fmtNum(c.engagement) },
    {                     label: 'Qual./DL',         fmt: (c) => c.installs > 0 ? `${(c.engagement / c.installs * 100).toFixed(1)}%` : '—' },
    // ── Cost ──────────────────────────────────────────────────────────────────
    { key: 'cost',        label: 'Coût',             fmt: (c) => Number(c.cost ?? 0) > 0 ? `$${Math.round(Number(c.cost))}` : '—' },
    { key: 'cpi',         label: 'CPI ($/Install)',  fmt: (c) => c.cpi > 0 ? fmtMoney(c.cpi) : '—' },
    { key: 'cpiEngagement', label: 'CPI Qual. ($/Qual.)', fmt: (c) => c.cpiEngagement > 0 ? fmtMoney(c.cpiEngagement) : '—' },
  ];
  if (!campaigns.length) return <p className="text-sm text-gray-400 py-6 text-center">Aucune campagne.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            {cols.map((c, i) => (
              <th key={c.key ?? `col-${i}`}
                onClick={c.key ? () => onSort(c.key!) : undefined}
                className={`px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap select-none ${c.key ? 'cursor-pointer hover:text-gray-700' : ''}`}>
                {c.label}{c.key && sortKey === c.key && <span className="ml-1 text-blue-500">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((camp, i) => (
            <tr key={camp.token} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
              {cols.map((c, ci) => (
                <td key={c.key ?? `col-${ci}`}
                  title={c.key === 'name' ? camp.name : undefined}
                  className={`px-3 py-2.5 font-mono text-gray-700 ${c.key === 'name' ? 'font-sans text-gray-800 font-medium max-w-xs truncate' : 'whitespace-nowrap'}`}>
                  {c.fmt(camp)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AdjustDashboard({ datePreset }: { datePreset: string }) {
  const [data,        setData]        = useState<AdjustResponse | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [sortKey,     setSortKey]     = useState<SortKey>('cost');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');
  const [hiddenCamps,      setHiddenCamps]      = useState<Set<string>>(new Set());
  const [selectedCampToken, setSelectedCampToken] = useState<string | null>(null);
  const [metaDailyRaw,     setMetaDailyRaw]     = useState<Array<{ date: string; campaignId: string; campaignName: string; installs: number; engagement: number; spend: number }> | null>(null);
  const [metaLoading,      setMetaLoading]      = useState(false);
  const [metaError,        setMetaError]        = useState<string | null>(null);
  const [showGenericOnly,   setShowGenericOnly]   = useState(false);
  const [budgetChanges,     setBudgetChanges]     = useState<Array<{ date: string; campaignId: string; campaignName: string; oldBudget: number; newBudget: number }>>([]);
  const [funnelRateKey,     setFunnelRateKey]     = useState<string>('engRate');
  const [funnelGroupFilter, setFunnelGroupFilter] = useState<string>('all');
  const [kpiSegment,        setKpiSegment]        = useState<'all' | 'generic' | 'iconic' | 'other_paid' | 'noncamp'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRawResponse(null);
    try {
      const res = await fetch(`/api/adjust?date_preset=${datePreset}`);
      const text = await res.text();
      setRawResponse(text);
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
      const json = JSON.parse(text);
      if ('error' in json && typeof json.error === 'string') throw new Error(json.error);
      setData(json as AdjustResponse);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erreur inconnue';
      console.warn('[AdjustDashboard] mock:', msg);
      setError(msg);
      setData(generateMock());
    } finally {
      setLoading(false);
    }
  }, [datePreset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch Meta daily installs + budget changes whenever datePreset changes
  // Use allSettled so a budget-changes failure never blocks installs from loading
  useEffect(() => {
    setMetaLoading(true);
    setMetaError(null);
    setMetaDailyRaw(null);
    Promise.allSettled([
      fetch(`/api/meta-daily-installs?date_preset=${datePreset}`).then((r) => r.json()),
      fetch(`/api/meta-budget-changes?date_preset=${datePreset}`).then((r) => r.json()),
    ])
      .then(([installs, budget]) => {
        if (installs.status === 'fulfilled') {
          const data = installs.value as { error?: string; rows?: typeof metaDailyRaw };
          if (data.error) setMetaError(data.error);
          else setMetaDailyRaw(data.rows ?? []);
        } else {
          setMetaError(installs.reason instanceof Error ? installs.reason.message : 'Erreur Meta installs');
        }
        if (budget.status === 'fulfilled') {
          const bdata = budget.value as { error?: string; changes?: typeof budgetChanges };
          if (!bdata.error) setBudgetChanges(bdata.changes ?? []);
        }
      })
      .finally(() => setMetaLoading(false));
  }, [datePreset]);

  // Auto-select first paid campaign when the list changes (new datePreset)
  useEffect(() => {
    setSelectedCampToken(null);
  }, [datePreset]);

  // Reset hidden camp legend selections when segment filter changes
  useEffect(() => {
    setHiddenCamps(new Set());
  }, [kpiSegment, showGenericOnly]);

  // ── 1. Base paid campaigns (Adjust data only) ─────────────────────────────
  const paidCampaigns = useMemo(() =>
    data ? data.campaigns.filter(
      (c) => (c.cost > 0 || c.installs > 0) && !EXCLUDED_CAMPAIGN_IDS.has(c.token)
    ) : []
  , [data]);

  // ── 2. Meta enrichment maps — built from metaDailyRaw ─────────────────────
  // For campaigns where Adjust reports $0 spend (e.g. web/landing campaign),
  // we inject the real cost from Meta so all KPIs recalculate from it.
  const metaEnrichment = useMemo(() => {
    const byId      = new Map<string, number>();
    const byNorm    = new Map<string, number>();
    const dailyByNorm = new Map<string, Map<string, number>>();
    if (!metaDailyRaw) {
      console.log('[meta-enrich] metaDailyRaw is null — skipping');
      return { byId, byNorm, dailyByNorm };
    }
    const rowsWithSpend = metaDailyRaw.filter((r) => r.spend > 0);
    console.log(`[meta-enrich] ${metaDailyRaw.length} rows total, ${rowsWithSpend.length} with spend>0`);
    for (const r of metaDailyRaw) {
      byId.set(r.campaignId, (byId.get(r.campaignId) ?? 0) + r.spend);
      const norm = normCampName(r.campaignName);
      if (norm) {
        byNorm.set(norm, (byNorm.get(norm) ?? 0) + r.spend);
        if (!dailyByNorm.has(norm)) dailyByNorm.set(norm, new Map());
        const dm = dailyByNorm.get(norm)!;
        dm.set(r.date, (dm.get(r.date) ?? 0) + r.spend);
      }
    }
    console.log('[meta-enrich] byNorm (name→spend):', Object.fromEntries(byNorm));
    return { byId, byNorm, dailyByNorm };
  }, [metaDailyRaw]);

  // ── 3. Enriched campaigns — Meta spend injected for $0-cost campaigns ─────
  // De-duplication: when two $0-cost Adjust campaigns share the same normCampName
  // (e.g. Landing + Web both strip to the same token), only the first one gets the
  // Meta spend — subsequent same-norm campaigns keep $0 so spend isn't double-counted.
  const enrichedPaidCampaigns = useMemo(() => {
    const usedNorms = new Set<string>();
    const result = paidCampaigns.map(c => {
      if (c.cost > 0) return c;
      const norm = normCampName(c.name);

      // Check direct token match first (always unique, safe to use)
      const byIdCost = metaEnrichment.byId.get(c.token) ?? 0;
      if (byIdCost > 0) {
        console.log(`[enrich] HIT(id) — "${c.name}" → $${byIdCost.toFixed(2)}`);
        return {
          ...c, cost: byIdCost,
          cpi:           c.installs    > 0 ? byIdCost / c.installs    : 0,
          cpm:           c.impressions > 0 ? (byIdCost / c.impressions) * 1000 : 0,
          cpiEngagement: c.engagement  > 0 ? byIdCost / c.engagement  : 0,
        };
      }

      // Norm-based match — deduplicate: skip if this norm was already enriched
      if (usedNorms.has(norm)) {
        console.log(`[enrich] DEDUP — "${c.name}" norm:"${norm}" already enriched, skipping`);
        return c;
      }

      let metaCost = metaEnrichment.byNorm.get(norm) ?? 0;
      // Fallback: prefix containment handles minor renames (e.g. _perf suffix)
      if (metaCost === 0 && norm.length >= 10) {
        for (const [metaNorm, spend] of metaEnrichment.byNorm) {
          if (metaNorm.length >= 10 && (metaNorm.startsWith(norm) || norm.startsWith(metaNorm))) {
            metaCost = spend;
            console.log(`[enrich] PREFIX-MATCH "${c.name}" via "${metaNorm}" → $${spend.toFixed(2)}`);
            break;
          }
        }
      }
      if (metaCost === 0) {
        console.log(`[enrich] MISS — token:"${c.token}" name:"${c.name}" norm:"${norm}"`);
        return c;
      }
      usedNorms.add(norm);
      console.log(`[enrich] HIT(norm) — "${c.name}" norm:"${norm}" → $${metaCost.toFixed(2)}`);
      return {
        ...c, cost: metaCost,
        cpi:           c.installs    > 0 ? metaCost / c.installs    : 0,
        cpm:           c.impressions > 0 ? (metaCost / c.impressions) * 1000 : 0,
        cpiEngagement: c.engagement  > 0 ? metaCost / c.engagement  : 0,
      };
    });
    const enriched = result.filter((c, i) => c.cost !== paidCampaigns[i]?.cost);
    console.log(`[enrich] ${enriched.length} campaigns enriched with Meta spend`);
    return result;
  }, [paidCampaigns, metaEnrichment]);

  // ── 4. Enriched daily rows — Meta daily spend injected for $0-cost rows ───
  const enrichedDailyRows = useMemo(() => {
    if (!data) return [];
    return data.daily.map(r => {
      if (r.cost > 0) return r;
      const daySpend = metaEnrichment.dailyByNorm.get(normCampName(r.campaignName))?.get(r.date) ?? 0;
      return daySpend > 0 ? { ...r, cost: daySpend } : r;
    });
  }, [data, metaEnrichment]);

  // ── 5. Campaign filter — respects both showGenericOnly and kpiSegment ────────
  // showGenericOnly is the charts/table toggle; kpiSegment is the segment selector.
  // Both drive the same filteredPaidCampaigns so all downstream (charts, table,
  // KPI totals) stay consistent without extra memos.
  const filteredPaidCampaigns = useMemo(() => {
    if (showGenericOnly) {
      return enrichedPaidCampaigns.filter((c) => isGenericCampaign(c.name));
    }
    const n = (s: string) => s.toLowerCase();
    if (kpiSegment === 'generic')    return enrichedPaidCampaigns.filter((c) => n(c.name).includes('generic'));
    if (kpiSegment === 'iconic')     return enrichedPaidCampaigns.filter((c) => n(c.name).includes('iconic'));
    if (kpiSegment === 'other_paid') return enrichedPaidCampaigns.filter((c) => c.cost > 0 && !n(c.name).includes('generic') && !n(c.name).includes('iconic'));
    if (kpiSegment === 'noncamp')    return []; // organic traffic — no campaign rows
    return enrichedPaidCampaigns;
  }, [enrichedPaidCampaigns, showGenericOnly, kpiSegment]);

  // ── 6. KPI totals — always derived from filteredPaidCampaigns ────────────
  const displayTotals = useMemo(() => {
    if (!data) return null;
    const isFiltered = showGenericOnly || kpiSegment !== 'all';
    if (!isFiltered) return null; // fall through to raw Adjust totals

    // noncamp: organic = Adjust grand total minus every paid campaign
    if (kpiSegment === 'noncamp') {
      const paidSum = enrichedPaidCampaigns.reduce(
        (s, c) => ({ installs: s.installs + c.installs, clicks: s.clicks + c.clicks, impressions: s.impressions + c.impressions, cost: s.cost + c.cost, engagement: s.engagement + c.engagement }),
        { installs: 0, clicks: 0, impressions: 0, cost: 0, engagement: 0 }
      );
      const t = data.totals;
      const installs    = Math.max(0, t.installs    - paidSum.installs);
      const cost        = Math.max(0, t.cost        - paidSum.cost);
      const engagement  = Math.max(0, t.engagement  - paidSum.engagement);
      const clicks      = Math.max(0, t.clicks      - paidSum.clicks);
      const impressions = Math.max(0, t.impressions - paidSum.impressions);
      return { installs, cost, engagement, clicks, impressions, sessions: 0, cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0, productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0, orderPlaceUnique: 0, productDetailOpenUnique: 0, cpi: installs > 0 ? cost / installs : 0, ctr: impressions > 0 ? clicks / impressions : 0, cpm: impressions > 0 ? (cost / impressions) * 1000 : 0, cpiEngagement: engagement > 0 ? cost / engagement : 0 };
    }

    const sum = filteredPaidCampaigns.reduce(
      (s, c) => ({ installs: s.installs + c.installs, clicks: s.clicks + c.clicks, impressions: s.impressions + c.impressions, cost: s.cost + c.cost, engagement: s.engagement + c.engagement, cartAdd: s.cartAdd + (c.cartAdd ?? 0), checkout: s.checkout + (c.checkout ?? 0), orderPlace: s.orderPlace + (c.orderPlace ?? 0), timeSpent: s.timeSpent + (c.timeSpent ?? 0), productDetailOpen: s.productDetailOpen + (c.productDetailOpen ?? 0), cartAddUnique: s.cartAddUnique + (c.cartAddUnique ?? 0), checkoutUnique: s.checkoutUnique + (c.checkoutUnique ?? 0), orderPlaceUnique: s.orderPlaceUnique + (c.orderPlaceUnique ?? 0), productDetailOpenUnique: s.productDetailOpenUnique + (c.productDetailOpenUnique ?? 0) }),
      { installs: 0, clicks: 0, impressions: 0, cost: 0, engagement: 0, cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0, productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0, orderPlaceUnique: 0, productDetailOpenUnique: 0 }
    );
    return { ...sum, sessions: 0, cpi: sum.installs > 0 ? sum.cost / sum.installs : 0, ctr: sum.impressions > 0 ? sum.clicks / sum.impressions : 0, cpm: sum.impressions > 0 ? (sum.cost / sum.impressions) * 1000 : 0, cpiEngagement: sum.engagement > 0 ? sum.cost / sum.engagement : 0 };
  }, [data, showGenericOnly, kpiSegment, enrichedPaidCampaigns, filteredPaidCampaigns]);

  // ── 7. Daily chart points — filtered by same segment ─────────────────────
  const dailyPoints = useMemo<DailyPoint[]>(() => {
    let rows = enrichedDailyRows;
    const isFiltered = showGenericOnly || kpiSegment !== 'all';
    if (isFiltered) {
      if (kpiSegment === 'noncamp') {
        // Show rows NOT belonging to any paid campaign
        const paidTokens = new Set(enrichedPaidCampaigns.map((c) => c.token));
        rows = enrichedDailyRows.filter((r) => !paidTokens.has(r.campaignToken));
      } else {
        const segTokens = new Set(filteredPaidCampaigns.map((c) => c.token));
        rows = enrichedDailyRows.filter((r) => segTokens.has(r.campaignToken));
      }
    }
    const pts = aggregateByDate(rows);
    return granularity === 'week' ? toWeekly(pts) : pts;
  }, [enrichedDailyRows, enrichedPaidCampaigns, filteredPaidCampaigns, granularity, showGenericOnly, kpiSegment]);

  const sortedCampaigns = useMemo(() => {
    return [...filteredPaidCampaigns].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [filteredPaidCampaigns, sortKey, sortDir]);

  const campaignCpiLines = useMemo(() => {
    if (!data || !filteredPaidCampaigns.length) return { cpiPoints: [], engPoints: [], keys: [] };
    const topCamps = [...filteredPaidCampaigns].sort((a, b) => b.installs - a.installs).slice(0, 8);
    const campByToken = new Map(topCamps.map((c) => [c.token, c.name.replace(/^Picta_/i, '').trim().slice(0, 30)]));
    type CampDay = { cost: number; installs: number; engagement: number };
    const acc = new Map<string, Map<string, CampDay>>();

    function weekKey(date: string): string {
      const d = new Date(date + 'T12:00:00');
      const dow = d.getDay();
      const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      return mon.toISOString().split('T')[0];
    }
    function makeDisplayDate(key: string): string {
      if (granularity === 'week') {
        const d = new Date(key + 'T12:00:00');
        return `S ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
      }
      return fmtDate(key);
    }

    for (const r of enrichedDailyRows) {
      const label = campByToken.get(r.campaignToken);
      if (!label) continue;
      const key = granularity === 'week' ? weekKey(r.date) : r.date;
      if (!acc.has(key)) acc.set(key, new Map());
      const dayMap = acc.get(key)!;
      const e = dayMap.get(label) ?? { cost: 0, installs: 0, engagement: 0 };
      e.cost += r.cost; e.installs += r.installs; e.engagement += r.engagement;
      dayMap.set(label, e);
    }
    const keys = [...campByToken.values()];
    const sorted = Array.from(acc.entries()).sort(([a], [b]) => a.localeCompare(b));
    const cpiPoints = sorted.map(([key, dayMap]) => {
      const pt: Record<string, string | number | null> = { displayDate: makeDisplayDate(key) };
      for (const k of keys) {
        const e = dayMap.get(k);
        pt[k] = e && e.installs > 0 ? +(e.cost / e.installs).toFixed(2) : null;
      }
      return pt;
    });
    const engPoints = sorted.map(([key, dayMap]) => {
      const pt: Record<string, string | number | null> = { displayDate: makeDisplayDate(key) };
      for (const k of keys) {
        const e = dayMap.get(k);
        pt[k] = e && e.engagement > 0 ? +(e.cost / e.engagement).toFixed(2) : null;
      }
      return pt;
    });
    return { cpiPoints, engPoints, keys };
  }, [data, enrichedDailyRows, filteredPaidCampaigns, granularity]);

  // ── Meta vs Adjust comparison — single campaign or all ───────────────────
  const comparisonData = useMemo(() => {
    if (!data || !metaDailyRaw || !selectedCampToken) return [];

    // Only numeric tokens can be matched to Meta campaign IDs
    const paidTokens = new Set(filteredPaidCampaigns.filter((c) => /^\d+$/.test(c.token)).map((c) => c.token));
    const isAll = selectedCampToken === '__all__';

    const adjRows = isAll
      ? data.daily.filter((r) => paidTokens.has(r.campaignToken))
      : data.daily.filter((r) => r.campaignToken === selectedCampToken);
    const metaRows = isAll
      ? metaDailyRaw.filter((r) => paidTokens.has(r.campaignId))
      : metaDailyRaw.filter((r) => r.campaignId === selectedCampToken);

    const dates = [...new Set([...adjRows.map((r) => r.date), ...metaRows.map((r) => r.date)])]
      .sort((a, b) => b.localeCompare(a));

    return dates.map((date) => {
      const adjDay  = adjRows.filter((r) => r.date === date)
        .reduce((s, r) => ({ installs: s.installs + r.installs, engagement: s.engagement + r.engagement }), { installs: 0, engagement: 0 });
      const metaDay = metaRows.filter((r) => r.date === date)
        .reduce((s, r) => ({ installs: s.installs + r.installs, engagement: s.engagement + r.engagement, spend: s.spend + (r.spend ?? 0) }), { installs: 0, engagement: 0, spend: 0 });

      const iGap    = adjDay.installs  - metaDay.installs;
      const iGapPct = metaDay.installs  > 0 ? (iGap / metaDay.installs)  * 100 : null;
      const eGap    = adjDay.engagement - metaDay.engagement;
      const eGapPct = metaDay.engagement > 0 ? (eGap / metaDay.engagement) * 100 : null;

      return { date, displayDate: fmtDate(date), metaSpend: metaDay.spend, adjInstalls: adjDay.installs, metaInstalls: metaDay.installs, iGap, iGapPct, adjEngagement: adjDay.engagement, metaEngagement: metaDay.engagement, eGap, eGapPct };
    }).filter((r) => r.adjInstalls > 0 || r.metaInstalls > 0 || r.adjEngagement > 0 || r.metaEngagement > 0);
  }, [data, metaDailyRaw, selectedCampToken, filteredPaidCampaigns]);

  // ── Comparaison créatifs : Dog Poster / Print to Video / Travel Card / Generic ──────────
  const CREATIVE_DEFS = [
    { key: 'dog',     label: 'Dog Poster',      color: '#f97316', test: (n: string) => n.includes('dog') },
    { key: 'ptv',     label: 'Print to Video',  color: '#8b5cf6', test: (n: string) => n.includes('print') || n.includes('ptv') },
    { key: 'travel',  label: 'Travel Card',      color: '#ec4899', test: (n: string) => n.includes('travel') || n.includes('card') },
    { key: 'generic', label: 'Generic',          color: '#06b6d4', test: (n: string) => n.includes('generic') },
    { key: 'iconic',  label: 'Iconic',           color: '#a855f7', test: (n: string) => n.includes('iconic') },
  ];

  const creativeGroups = useMemo(() => {
    return CREATIVE_DEFS.map(({ key, label, color, test }) => {
      const matched = enrichedPaidCampaigns.filter((c) => test(c.name.toLowerCase()));
      const cost        = matched.reduce((s, c) => s + c.cost, 0);
      const installs    = matched.reduce((s, c) => s + c.installs, 0);
      const clicks      = matched.reduce((s, c) => s + c.clicks, 0);
      const impressions = matched.reduce((s, c) => s + c.impressions, 0);
      const engagement  = matched.reduce((s, c) => s + c.engagement, 0);
      return {
        key, label, color,
        count: matched.length,
        campaigns: matched.map((c) => c.name),
        cost,
        installs,
        clicks,
        impressions,
        engagement,
        cpi:           installs    > 0 ? cost / installs    : 0,
        cpiEngagement: engagement  > 0 ? cost / engagement  : 0,
        ctr:           impressions > 0 ? clicks / impressions : 0,
        cpm:           impressions > 0 ? (cost / impressions) * 1000 : 0,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedPaidCampaigns]);

  // ── Funnel : iOS · Android · Web — respects segment filter ─────────────
  const genericFunnel = useMemo(() => {
    const genericCamps = filteredPaidCampaigns.length > 0 ? filteredPaidCampaigns : enrichedPaidCampaigns.filter((c) => c.name.toLowerCase().includes('generic'));

    type Platform = 'iOS' | 'Android' | 'Web';
    const PLATFORMS: Platform[] = ['iOS', 'Android', 'Web'];
    const PLT_COLORS: Record<Platform, string> = { iOS: '#3b82f6', Android: '#10b981', Web: '#f97316' };

    function platformOf(name: string): Platform {
      const n = name.toLowerCase();
      if (n.includes('ios')) return 'iOS';
      if (n.includes('android')) return 'Android';
      return 'Web';
    }

    type Group = { impressions: number; clicks: number; installs: number; engagement: number; cartAdd: number; checkout: number; orderPlace: number; timeSpent: number; cost: number; campaigns: string[] };
    const groups = new Map<Platform, Group>(PLATFORMS.map((p) => [p, { impressions: 0, clicks: 0, installs: 0, engagement: 0, cartAdd: 0, checkout: 0, orderPlace: 0, timeSpent: 0, cost: 0, campaigns: [] }]));

    for (const c of genericCamps) {
      const g = groups.get(platformOf(c.name))!;
      g.impressions += c.impressions;
      g.clicks      += c.clicks;
      g.installs    += c.installs;
      g.engagement  += c.engagement;
      g.cartAdd     += (c.cartAdd    ?? 0);
      g.checkout    += (c.checkout   ?? 0);
      g.orderPlace  += (c.orderPlace ?? 0);
      g.timeSpent   += (c.timeSpent  ?? 0);
      g.cost        += c.cost;
      g.campaigns.push(c.name);
    }

    return PLATFORMS.map((p) => {
      const g = groups.get(p)!;
      return {
        platform: p,
        color: PLT_COLORS[p],
        ...g,
        ctr:             g.impressions > 0 ? g.clicks      / g.impressions : 0,
        installRate:     g.clicks      > 0 ? g.installs    / g.clicks      : 0,
        engagementRate:  g.installs    > 0 ? g.engagement  / g.installs    : 0,
        cartAddRate:     g.engagement  > 0 ? g.cartAdd     / g.engagement  : 0,
        checkoutRate:    g.cartAdd     > 0 ? g.checkout    / g.cartAdd     : 0,
        orderPlaceRate:  g.checkout    > 0 ? g.orderPlace  / g.checkout    : 0,
        avgTimeSpent:    g.installs    > 0 ? g.timeSpent   / g.installs    : 0, // seconds/user
        cpi:             g.installs    > 0 ? g.cost        / g.installs    : 0,
        cpiEngagement:   g.engagement  > 0 ? g.cost        / g.engagement  : 0,
      };
    }).filter((g) => g.impressions > 0 || g.installs > 0);
  }, [enrichedPaidCampaigns, filteredPaidCampaigns]);

  // ── Creative Funnel : Generic vs Iconic ──────────────────────────────────
  const creativeVsIconic = useMemo(() => {
    const genericCamps = enrichedPaidCampaigns.filter((c) => c.name.toLowerCase().includes('generic'));
    const iconicCamps  = enrichedPaidCampaigns.filter((c) => c.name.toLowerCase().includes('iconic'));

    function sumCamps(camps: AdjustCampaignSummary[]) {
      const z = { impressions: 0, clicks: 0, installs: 0, engagement: 0, cost: 0,
        cartAdd: 0, checkout: 0, orderPlace: 0,
        productDetailOpen: 0, cartAddUnique: 0, checkoutUnique: 0, orderPlaceUnique: 0, productDetailOpenUnique: 0 };
      for (const c of camps) {
        z.impressions           += c.impressions;
        z.clicks                += c.clicks;
        z.installs              += c.installs;
        z.engagement            += c.engagement;
        z.cost                  += c.cost;
        z.cartAdd               += (c.cartAdd    ?? 0);
        z.checkout              += (c.checkout   ?? 0);
        z.orderPlace            += (c.orderPlace ?? 0);
        z.productDetailOpen        += (c.productDetailOpen        ?? 0);
        z.cartAddUnique            += (c.cartAddUnique            ?? 0);
        z.checkoutUnique           += (c.checkoutUnique           ?? 0);
        z.orderPlaceUnique         += (c.orderPlaceUnique         ?? 0);
        z.productDetailOpenUnique  += (c.productDetailOpenUnique  ?? 0);
      }
      return {
        ...z,
        cpm:           z.impressions > 0 ? (z.cost / z.impressions) * 1000 : 0,
        ctr:           z.impressions > 0 ? z.clicks / z.impressions : 0,
        installRate:   z.clicks      > 0 ? z.installs / z.clicks      : 0,
        cpi:           z.installs    > 0 ? z.cost / z.installs    : 0,
        cpiEngagement: z.engagement  > 0 ? z.cost / z.engagement  : 0,
        engRate:       z.installs    > 0 ? z.engagement / z.installs : 0,
        pdRate:        z.installs    > 0 ? z.productDetailOpen / z.installs : 0,
        pdUniqueRate:  z.installs    > 0 ? z.productDetailOpenUnique / z.installs : 0,
        cartRate:      z.engagement  > 0 ? z.cartAdd / z.engagement  : 0,
        cartUniqueRate:z.engagement  > 0 ? z.cartAddUnique / z.engagement : 0,
        coRate:        z.cartAdd     > 0 ? z.checkout / z.cartAdd    : 0,
        coUniqueRate:  z.cartAddUnique > 0 ? z.checkoutUnique / z.cartAddUnique : 0,
        ordRate:       z.checkout    > 0 ? z.orderPlace / z.checkout : 0,
        ordUniqueRate: z.checkoutUnique > 0 ? z.orderPlaceUnique / z.checkoutUnique : 0,
        count: camps.length,
        names: camps.map((c) => c.name),
      };
    }

    return {
      generic: sumCamps(genericCamps),
      iconic:  sumCamps(iconicCamps),
      hasData: genericCamps.length > 0 || iconicCamps.length > 0,
    };
  }, [enrichedPaidCampaigns]);

  // ── Interactive funnel chart — per campaign conversion rates ─────────────
  const FUNNEL_RATES = [
    { key: 'ctr',            label: 'CTR',                    desc: 'Clics / Impressions' },
    { key: 'installRate',    label: 'Install Rate',            desc: 'Installs / Clics' },
    { key: 'engRate',        label: 'Taux Engagement',         desc: 'Engagement / Installs' },
    { key: 'pdUniqueRate',   label: 'Product Detail',          desc: 'PD Unique / Installs' },
    { key: 'cartRate',       label: 'Panier',                  desc: 'Panier / Engagement' },
    { key: 'cartUniqueRate', label: 'Panier Unique',           desc: 'Panier Uniq / Engagement' },
    { key: 'coRate',         label: 'Checkout',                desc: 'Checkout / Panier' },
    { key: 'coUniqueRate',   label: 'Checkout Unique',         desc: 'Checkout Uniq / Panier Uniq' },
    { key: 'ordRate',        label: 'Order',                   desc: 'Order / Checkout' },
    { key: 'ordUniqueRate',  label: 'Order Unique',            desc: 'Order Uniq / Checkout Uniq' },
  ];

  const FUNNEL_FILTERS = [
    { key: 'all',     label: 'Tous',          test: (_n: string) => true },
    { key: 'generic', label: 'Generic',       test: (n: string) => n.includes('generic') },
    { key: 'iconic',  label: 'Iconic',        test: (n: string) => n.includes('iconic') },
    { key: 'dog',     label: 'Dog Poster',    test: (n: string) => n.includes('dog') },
    { key: 'ptv',     label: 'Print to Video',test: (n: string) => n.includes('print') || n.includes('ptv') },
    { key: 'travel',  label: 'Travel Card',   test: (n: string) => n.includes('travel') || n.includes('card') },
  ];

  const funnelChartData = useMemo(() => {
    const filterDef = FUNNEL_FILTERS.find((f) => f.key === funnelGroupFilter) ?? FUNNEL_FILTERS[0];
    return enrichedPaidCampaigns
      .filter((c) => filterDef.test(c.name.toLowerCase()))
      .map((c) => {
        const pd = c.productDetailOpenUnique ?? 0;
        const cu = c.cartAddUnique ?? 0;
        const cou = c.checkoutUnique ?? 0;
        const ou = c.orderPlaceUnique ?? 0;
        const rates: Record<string, number> = {
          ctr:            c.impressions  > 0 ? c.clicks / c.impressions : 0,
          installRate:    c.clicks       > 0 ? c.installs / c.clicks : 0,
          engRate:        c.installs     > 0 ? c.engagement / c.installs : 0,
          pdUniqueRate:   c.installs     > 0 ? pd / c.installs : 0,
          cartRate:       c.engagement   > 0 ? c.cartAdd / c.engagement : 0,
          cartUniqueRate: c.engagement   > 0 ? cu / c.engagement : 0,
          coRate:         c.cartAdd      > 0 ? c.checkout / c.cartAdd : 0,
          coUniqueRate:   cu             > 0 ? cou / cu : 0,
          ordRate:        c.checkout     > 0 ? c.orderPlace / c.checkout : 0,
          ordUniqueRate:  cou            > 0 ? ou / cou : 0,
        };
        const shortName = c.name
          .replace(/^(US_)?Picta_/i, '')
          .replace(/_Meta_clickoncta/i, '')
          .replace(/_allformats.*/i, '')
          .replace(/[_\s]+\d{6,}$/, '')
          .replace(/_/g, ' ')
          .trim()
          .slice(0, 28);
        return { name: shortName, value: rates[funnelRateKey] ?? 0, token: c.token, cost: c.cost };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichedPaidCampaigns, funnelGroupFilter, funnelRateKey]);

  // ── Budget change reference lines — grouped by date ─────────────────────
  const budgetRefLines = useMemo(() => {
    // Abbreviate campaign names for chart labels
    function abbrev(name: string): string {
      return name
        .replace(/^US_Picta_/i, '')
        .replace(/^Picta_/i, '')
        .replace(/_allformats.*/i, '')
        .replace(/_Meta_clickoncta/i, '')
        .replace(/_7day.*/i, '')
        .replace(/_/g, ' ')
        .trim()
        .slice(0, 18);
    }
    // Group by date — one line per date, combine labels
    const byDate = new Map<string, { label: string; maxIncrease: number }>();
    for (const bc of budgetChanges) {
      const inc   = bc.newBudget - bc.oldBudget;
      const label = `↑ ${abbrev(bc.campaignName)} +$${inc}`;
      const existing = byDate.get(bc.date);
      if (!existing) {
        byDate.set(bc.date, { label, maxIncrease: inc });
      } else {
        // Multiple changes same day — show the first, append count
        byDate.set(bc.date, { label: existing.label + ` (+${byDate.size > 1 ? 'etc.' : ''})`, maxIncrease: Math.max(existing.maxIncrease, inc) });
      }
    }
    // Map to chart displayDate values
    return Array.from(byDate.entries()).map(([date, info]) => ({
      date,
      displayDate: dailyPoints.find((p) => p.date === date)?.displayDate ?? null,
      label: info.label,
    })).filter((r) => r.displayDate !== null);
  }, [budgetChanges, dailyPoints]);

  // ── Daily aggregation for the weekly performance table ───────────────────
  const dailyAggByDate = useMemo(() => {
    // Re-use the same segment filtering logic as dailyPoints for consistency
    let rows = enrichedDailyRows;
    const isFiltered = showGenericOnly || kpiSegment !== 'all';
    if (isFiltered) {
      if (kpiSegment === 'noncamp') {
        const paidTokens = new Set(enrichedPaidCampaigns.map((c) => c.token));
        rows = rows.filter((r) => !paidTokens.has(r.campaignToken));
      } else {
        const segTokens = new Set(filteredPaidCampaigns.map((c) => c.token));
        rows = rows.filter((r) => segTokens.has(r.campaignToken));
      }
    }
    const map = new Map<string, {
      date: string; installs: number; clicks: number; cost: number; engagement: number;
      cartAddUnique: number; checkoutUnique: number; orderPlaceUnique: number;
    }>();
    for (const r of rows) {
      const e = map.get(r.date);
      if (!e) {
        map.set(r.date, {
          date: r.date,
          installs: r.installs, clicks: r.clicks ?? 0, cost: r.cost, engagement: r.engagement,
          cartAddUnique: r.cartAddUnique ?? 0, checkoutUnique: r.checkoutUnique ?? 0,
          orderPlaceUnique: r.orderPlaceUnique ?? 0,
        });
      } else {
        e.installs += r.installs; e.clicks += r.clicks ?? 0; e.cost += r.cost; e.engagement += r.engagement;
        e.cartAddUnique += r.cartAddUnique ?? 0; e.checkoutUnique += r.checkoutUnique ?? 0;
        e.orderPlaceUnique += r.orderPlaceUnique ?? 0;
      }
    }
    return Array.from(map.values())
      .filter((d) => d.installs > 0 || d.cost > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [enrichedDailyRows, enrichedPaidCampaigns, filteredPaidCampaigns, showGenericOnly, kpiSegment]);

  const toggleCamp = useCallback((key: string) => {
    setHiddenCamps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Show full spinner only on initial load (no data yet)
  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
        <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">Chargement des données Adjust…</p>
      </div>
    );
  }

  const { totals, prevTotals } = data!;
  const isEmpty = !error && data!.campaigns.length === 0 && totals.cost === 0;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  // Averages for reference lines
  const avgInstalls      = meanOf(dailyPoints, 'installs');
  const avgEngagement    = meanOf(dailyPoints, 'engagement');
  const avgEngRate       = meanOf(dailyPoints, 'engagementRate');
  const avgCpi           = meanOf(dailyPoints, 'cpi');
  const avgCpiEngage     = meanOf(dailyPoints, 'cpiEngagement');

  const effectiveTotals     = displayTotals ?? totals;
  const effectivePrevTotals = showGenericOnly
    ? (data?.genericPrevTotals ?? null)
    : kpiSegment === 'generic'    ? (data?.genericPrevTotals   ?? null)
    : kpiSegment === 'iconic'     ? (data?.iconicPrevTotals    ?? null)
    : kpiSegment === 'other_paid' ? (data?.otherPaidPrevTotals ?? null)
    : kpiSegment === 'noncamp'    ? (data?.noncampPrevTotals   ?? null)
    : prevTotals;

  const kpis = [
    { label: 'Coût total',       value: effectiveTotals.cost,          prev: effectivePrevTotals?.cost,          display: `$${Number(effectiveTotals.cost ?? 0).toFixed(0)}`, lowerIsBetter: true  },
    { label: 'Installs',         value: effectiveTotals.installs,      prev: effectivePrevTotals?.installs,      display: fmtNum(effectiveTotals.installs),                   lowerIsBetter: false },
    { label: 'CPI',              value: effectiveTotals.cpi,           prev: effectivePrevTotals?.cpi,           display: effectiveTotals.cpi > 0 ? fmtMoney(effectiveTotals.cpi) : '—',           lowerIsBetter: true  },
    { label: 'Engage. installs', value: effectiveTotals.engagement,    prev: effectivePrevTotals?.engagement,    display: fmtNum(effectiveTotals.engagement),                 lowerIsBetter: false },
    { label: 'CPI Engagement',   value: effectiveTotals.cpiEngagement, prev: effectivePrevTotals?.cpiEngagement, display: effectiveTotals.cpiEngagement > 0 ? fmtMoney(effectiveTotals.cpiEngagement) : '—', lowerIsBetter: true },
    { label: 'Clics',            value: effectiveTotals.clicks,        prev: effectivePrevTotals?.clicks,        display: fmtNum(effectiveTotals.clicks),                     lowerIsBetter: false },
    { label: 'Impressions',      value: effectiveTotals.impressions,   prev: effectivePrevTotals?.impressions,   display: fmtNum(effectiveTotals.impressions),                lowerIsBetter: false },
    { label: 'CPM',              value: effectiveTotals.cpm,           prev: effectivePrevTotals?.cpm,           display: fmtMoney(effectiveTotals.cpm),                      lowerIsBetter: true  },
  ];

  return (
    <div className={`space-y-6 transition-opacity duration-150 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>

      {/* Subtle re-fetch indicator */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <svg className="w-3.5 h-3.5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Mise à jour…
        </div>
      )}

      {/* Error / mock banner */}
      {error && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <span className="mt-0.5 shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold">Adjust — données de démonstration</p>
            <p className="text-amber-700 mt-0.5 text-xs">{error}</p>
            <p className="text-amber-700 mt-1 text-xs">
              Configure <code className="bg-amber-100 px-1 rounded">ADJUST_API_TOKEN</code> et <code className="bg-amber-100 px-1 rounded">ADJUST_APP_TOKENS</code> dans Vercel.
            </p>
          </div>
          <button onClick={fetchData} className="text-xs font-medium underline hover:no-underline shrink-0">Réessayer</button>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 space-y-3">
          <p className="font-semibold text-red-800 text-sm">⚠️ Adjust a répondu mais sans données</p>
          <ul className="text-red-700 text-xs list-disc pl-4 space-y-0.5">
            <li><strong>App token incorrect</strong> — vérifie <code className="bg-red-100 px-1 rounded">ADJUST_APP_TOKENS</code> dans Vercel</li>
            <li><strong>Aucune donnée sur la période</strong> — essaie <code className="bg-red-100 px-1 rounded">last_90d</code></li>
          </ul>
          {rawResponse && (
            <details className="text-xs">
              <summary className="cursor-pointer text-red-700 font-medium hover:underline">Réponse brute</summary>
              <pre className="mt-2 bg-red-100 rounded p-3 overflow-x-auto text-[10px] text-red-900 max-h-48">
                {(() => { try { return JSON.stringify(JSON.parse(rawResponse), null, 2); } catch { return rawResponse; } })()}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* ── Sticky controls ──────────────────────────────────────────────── */}
      <div className="sticky top-[121px] z-[9] -mx-6 px-6 py-2.5 bg-white border-b border-gray-100 shadow-sm flex items-center gap-3">
        <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 font-mono hidden sm:inline">
          Adjust · KPI Service v1
        </span>
        {/* Meta enrichment debug indicator */}
        {(() => {
          const enriched = enrichedPaidCampaigns.filter((c, i) => c.cost !== paidCampaigns[i]?.cost);
          const totalMeta = [...metaEnrichment.byNorm.values()].reduce((a, b) => a + b, 0);
          if (!metaDailyRaw) return null;
          return (
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${
              enriched.length > 0
                ? 'text-green-700 bg-green-50 border-green-200'
                : 'text-orange-600 bg-orange-50 border-orange-200'
            }`} title={[
                `Meta: ${metaDailyRaw.length} rows · $${totalMeta.toFixed(0)} total`,
                `Noms Meta (normalisés): ${[...metaEnrichment.byNorm.entries()].map(([k,v]) => `${k}=$${v.toFixed(0)}`).join(' | ') || '—'}`,
                `Adjust $0 cherchent: ${paidCampaigns.filter(c => c.cost === 0).map(c => `"${c.name}"→${normCampName(c.name)}`).join(' | ') || '—'}`,
                `Enrichis: ${enriched.map(c => c.name).join(', ') || 'aucun'}`,
              ].join('\n')}>
              Meta ${totalMeta.toFixed(0)} · {enriched.length} enrichi{enriched.length !== 1 ? 's' : ''}
            </span>
          );
        })()}
        <button
          onClick={() => { setShowGenericOnly((v) => !v); setKpiSegment('all'); }}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
            showGenericOnly
              ? 'bg-cyan-500 text-white border-cyan-500 shadow-sm'
              : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
          }`}
        >
          <span>Generic only</span>
          {showGenericOnly && <span className="opacity-80">×</span>}
        </button>
        {/* Segment filter — drives KPI cards, charts, table across the whole tab */}
        <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
          {([
            { value: 'all',        label: 'Tous' },
            { value: 'generic',    label: 'Generic' },
            { value: 'iconic',     label: 'Iconic' },
            { value: 'other_paid', label: 'Autres paid' },
            { value: 'noncamp',    label: 'Non-camp.' },
          ] as const).map(({ value, label }) => (
            <button key={value} onClick={() => { setKpiSegment(value); setShowGenericOnly(false); }}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${kpiSegment === value && !showGenericOnly ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-0.5 bg-gray-100 rounded-lg p-1">
          {(['day', 'week'] as Granularity[]).map((g) => (
            <button key={g} onClick={() => setGranularity(g)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${granularity === g ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {g === 'day' ? 'Jour' : 'Semaine'}
            </button>
          ))}
        </div>
      </div>

      {/* Segment active banner */}
      {(kpiSegment !== 'all' || showGenericOnly) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-700">
          <span className="font-semibold">Filtre actif :</span>
          <span className="bg-indigo-100 px-2 py-0.5 rounded-full font-mono">
            {showGenericOnly ? 'Generic only' : kpiSegment === 'generic' ? 'Generic' : kpiSegment === 'iconic' ? 'Iconic' : kpiSegment === 'other_paid' ? 'Autres paid' : 'Non-campagnes'}
          </span>
          <span className="text-indigo-400">— toutes les métriques et graphiques sont filtrés sur ce segment</span>
          <button onClick={() => { setKpiSegment('all'); setShowGenericOnly(false); }} className="ml-auto text-indigo-500 hover:text-indigo-700 font-semibold">× Retirer</button>
        </div>
      )}

      {/* 1. KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} prevValue={k.prev ?? null} display={k.display} lowerIsBetter={k.lowerIsBetter} />
        ))}
      </div>

      {/* 2. Installs+Engagement stacked histogram & Taux de transformation */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Installs · part engagée" subtitle="Total installs · portion ayant déclenché l'engagement (vert)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis {...AXIS_COMMON} width={35} />
              <Tooltip content={<NumTooltip />} />
              <Bar dataKey="nonEngaged" name="Non engagés" stackId="a" fill="#93c5fd" />
              <Bar dataKey="engagement" name="Engagés"     stackId="a" fill="#10b981" radius={[3, 3, 0, 0]} />
              {avgInstalls > 0 && (
                <ReferenceLine y={avgInstalls} {...REFLINE_STYLE}
                  label={{ value: `moy. ${Math.round(avgInstalls)}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
              )}
              {budgetRefLines.map((bl) => (
                <ReferenceLine key={bl.date} x={bl.displayDate!} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: bl.label, position: 'insideTopLeft', fontSize: 8, fill: '#d97706', angle: -90 }} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Taux engagement / installs" subtitle="% d'installs avec engagement · courbe macro">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `${((v as number) * 100).toFixed(0)}%`} {...AXIS_COMMON} width={42} />
              <Tooltip content={<PctTooltip />} />
              <Line type="monotone" dataKey="engagementRate" name="Taux engage." stroke="#8b5cf6" strokeWidth={2} dot={false} />
              {avgEngRate > 0 && (
                <ReferenceLine y={avgEngRate} {...REFLINE_STYLE}
                  label={{ value: `moy. ${(avgEngRate * 100).toFixed(1)}%`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 3. Taux de conversion Clic → Install */}
      {dailyPoints.some((p) => p.clicks > 0) && (
        <ChartCard title="Taux Clic → Install" subtitle="% de clics convertis en téléchargements · évolution quotidienne">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `${((v as number) * 100).toFixed(0)}%`} {...AXIS_COMMON} width={42} />
              <Tooltip formatter={(v: unknown) => [`${(Number(v) * 100).toFixed(1)}%`, 'Clic → Install']} />
              <Line type="monotone" dataKey="installRate" name="Clic→Install" stroke="#f97316" strokeWidth={2} dot={false} />
              {(() => {
                const avg = meanOf(dailyPoints.filter((p) => p.installRate > 0), 'installRate');
                return avg > 0 ? (
                  <ReferenceLine y={avg} {...REFLINE_STYLE}
                    label={{ value: `moy. ${(avg * 100).toFixed(1)}%`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
                ) : null;
              })()}
              {budgetRefLines.map((bl) => (
                <ReferenceLine key={bl.date} x={bl.displayDate!} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: bl.label, position: 'insideTopLeft', fontSize: 8, fill: '#d97706', angle: -90 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* 4. CPI + CPI Engagement */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="CPI (Coût par install)" subtitle="Évolution du coût d'acquisition">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `$${(v as number).toFixed(1)}`} {...AXIS_COMMON} width={46} />
              <Tooltip content={<MoneyTooltip />} />
              <Line type="monotone" dataKey="cpi" name="CPI ($)" stroke="#10b981" strokeWidth={2} dot={false} />
              {avgCpi > 0 && (
                <ReferenceLine y={avgCpi} {...REFLINE_STYLE}
                  label={{ value: `moy. $${avgCpi.toFixed(2)}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
              )}
              {budgetRefLines.map((bl) => (
                <ReferenceLine key={bl.date} x={bl.displayDate!} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: bl.label, position: 'insideTopLeft', fontSize: 8, fill: '#d97706', angle: -90 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CPI Engagement" subtitle="Coût par install_engagement — qualité des installs">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `$${(v as number).toFixed(1)}`} {...AXIS_COMMON} width={46} />
              <Tooltip content={<MoneyTooltip />} />
              <Line type="monotone" dataKey="cpiEngagement" name="CPI Engage. ($)" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              {avgCpiEngage > 0 && (
                <ReferenceLine y={avgCpiEngage} {...REFLINE_STYLE}
                  label={{ value: `moy. $${avgCpiEngage.toFixed(2)}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
              )}
              {budgetRefLines.map((bl) => (
                <ReferenceLine key={bl.date} x={bl.displayDate!} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
                  label={{ value: bl.label, position: 'insideTopLeft', fontSize: 8, fill: '#d97706', angle: -90 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 5. CPI par campagne + CPI Engagement par campagne */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="CPI par campagne" subtitle="Cliquer sur la légende pour masquer/afficher une campagne">
          {campaignCpiLines.keys.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Aucune campagne payante avec installs.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={campaignCpiLines.cpiPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `$${Number(v).toFixed(1)}`} {...AXIS_COMMON} width={46} />
                  <Tooltip content={<MoneyTooltip />} />
                  {campaignCpiLines.keys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} name={key}
                      stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls
                      hide={hiddenCamps.has(key)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <CampLegend keys={campaignCpiLines.keys} hidden={hiddenCamps} onToggle={toggleCamp} colors={COLORS} />
            </>
          )}
        </ChartCard>

        <ChartCard title="CPI Engagement par campagne" subtitle="Cliquer sur la légende pour masquer/afficher une campagne">
          {campaignCpiLines.keys.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Aucune campagne payante avec installs.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={campaignCpiLines.engPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                  <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v) => `$${Number(v).toFixed(1)}`} {...AXIS_COMMON} width={46} />
                  <Tooltip content={<MoneyTooltip />} />
                  {campaignCpiLines.keys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} name={key}
                      stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls
                      hide={hiddenCamps.has(key)}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <CampLegend keys={campaignCpiLines.keys} hidden={hiddenCamps} onToggle={toggleCamp} colors={COLORS} />
            </>
          )}
        </ChartCard>
      </div>

      {/* 6. Campaign table */}
      <ChartCard title="Tableau par campagne" subtitle="Cliquer sur un en-tête pour trier">
        <CampaignTable campaigns={sortedCampaigns} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      </ChartCard>

      {/* 7. Meta vs Adjust daily gap per campaign */}
      {filteredPaidCampaigns.length > 0 && (
        <ChartCard
          title="Gap Meta vs Adjust par campagne"
          subtitle="Installs : mobile_app_install · Engagement : omni_activate_app (Meta) vs install_engagement_events (Adjust)"
        >
          {/* Campaign selector */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <label className="text-xs font-semibold text-gray-500 whitespace-nowrap">Campagne :</label>
            <select
              value={selectedCampToken ?? ''}
              onChange={(e) => setSelectedCampToken(e.target.value || null)}
              className="flex-1 min-w-[200px] border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 truncate"
            >
              <option value="">— Choisir —</option>
              <option value="__all__">Toutes les campagnes</option>
              {filteredPaidCampaigns.filter((c) => /^\d+$/.test(c.token)).map((c) => (
                <option key={c.token} value={c.token}>{c.name}</option>
              ))}
            </select>
            {metaLoading && (
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Chargement Meta…
              </span>
            )}
            {metaError && (
              <span className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2 py-1" title={metaError}>
                ⚠ Erreur Meta
              </span>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mb-4 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Adjust</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500 inline-block" /> Meta</span>
            <span>Écart = Adjust − Meta · <span className="text-green-600 font-medium">vert &lt;10%</span> · <span className="text-orange-500 font-medium">orange 10–30%</span> · <span className="text-red-500 font-medium">rouge &gt;30%</span></span>
          </div>

          {!selectedCampToken ? (
            <p className="text-sm text-gray-400 text-center py-8">Sélectionner une campagne ci-dessus.</p>
          ) : comparisonData.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {metaLoading ? 'Chargement des données Meta…' : 'Aucune donnée pour cette campagne sur la période.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-2 pr-4 text-gray-500 font-semibold sticky left-0 bg-white z-10 whitespace-nowrap">Date</th>
                    <th className="text-center py-2 px-3 font-semibold text-violet-600 border-l border-gray-200 whitespace-nowrap">Dépenses Meta</th>
                    <th colSpan={3} className="text-center py-2 px-3 font-semibold text-blue-600 border-l border-gray-200">App Installs</th>
                    <th colSpan={3} className="text-center py-2 px-3 font-semibold text-violet-600 border-l border-gray-200">App Install Engagement</th>
                  </tr>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] text-gray-400">
                    <th className="sticky left-0 bg-gray-50 py-1.5" />
                    <th className="text-right py-1.5 px-2 border-l border-gray-200 whitespace-nowrap font-medium text-violet-500">$</th>
                    <th className="text-right py-1.5 px-2 border-l border-gray-200 whitespace-nowrap font-medium text-blue-500">Adjust</th>
                    <th className="text-right py-1.5 px-2 whitespace-nowrap font-medium text-violet-500">Meta</th>
                    <th className="text-right py-1.5 px-2 whitespace-nowrap font-semibold text-gray-600">Écart</th>
                    <th className="text-right py-1.5 px-2 border-l border-gray-200 whitespace-nowrap font-medium text-blue-500">Adjust</th>
                    <th className="text-right py-1.5 px-2 whitespace-nowrap font-medium text-violet-500">Meta</th>
                    <th className="text-right py-1.5 px-2 whitespace-nowrap font-semibold text-gray-600">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comparisonData.map((row) => {
                    const iCls = row.iGapPct === null ? 'text-gray-400'
                      : Math.abs(row.iGapPct) < 10 ? 'text-green-600 font-semibold'
                      : Math.abs(row.iGapPct) < 30 ? 'text-orange-500 font-semibold'
                      : 'text-red-500 font-semibold';
                    const eCls = row.eGapPct === null ? 'text-gray-400'
                      : Math.abs(row.eGapPct) < 10 ? 'text-green-600 font-semibold'
                      : Math.abs(row.eGapPct) < 30 ? 'text-orange-500 font-semibold'
                      : 'text-red-500 font-semibold';
                    return (
                      <tr key={row.date} className="hover:bg-blue-50/20 transition-colors">
                        <td className="py-2 pr-4 font-medium text-gray-600 sticky left-0 bg-white whitespace-nowrap z-10">{row.displayDate}</td>
                        <td className="py-2 px-2 text-right font-mono text-violet-700 tabular-nums border-l border-gray-200">
                          {row.metaSpend > 0 ? fmtMoney(row.metaSpend) : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-blue-700 tabular-nums border-l border-gray-200">
                          {row.adjInstalls > 0 ? row.adjInstalls : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-violet-700 tabular-nums">
                          {row.metaInstalls > 0 ? row.metaInstalls : <span className="text-gray-200">—</span>}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono tabular-nums ${iCls}`}>
                          {row.iGapPct !== null
                            ? <>{row.iGap > 0 ? '+' : ''}{row.iGap}<span className="text-[9px] ml-0.5 opacity-70">({row.iGap > 0 ? '+' : ''}{row.iGapPct.toFixed(0)}%)</span></>
                            : '—'}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-blue-700 tabular-nums border-l border-gray-200">
                          {row.adjEngagement > 0 ? row.adjEngagement : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-violet-700 tabular-nums">
                          {row.metaEngagement > 0 ? row.metaEngagement : <span className="text-gray-200">—</span>}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono tabular-nums ${eCls}`}>
                          {row.eGapPct !== null
                            ? <>{row.eGap > 0 ? '+' : ''}{row.eGap}<span className="text-[9px] ml-0.5 opacity-70">({row.eGap > 0 ? '+' : ''}{row.eGapPct.toFixed(0)}%)</span></>
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  {(() => {
                    const tot = comparisonData.reduce(
                      (s, r) => ({ ai: s.ai + r.adjInstalls, mi: s.mi + r.metaInstalls, ae: s.ae + r.adjEngagement, me: s.me + r.metaEngagement, ms: s.ms + (r.metaSpend ?? 0) }),
                      { ai: 0, mi: 0, ae: 0, me: 0, ms: 0 }
                    );
                    const iG = tot.ai - tot.mi;
                    const iP = tot.mi > 0 ? (iG / tot.mi) * 100 : null;
                    const eG = tot.ae - tot.me;
                    const eP = tot.me > 0 ? (eG / tot.me) * 100 : null;
                    const iCls = iP === null ? 'text-gray-500' : Math.abs(iP) < 10 ? 'text-green-700' : Math.abs(iP) < 30 ? 'text-orange-600' : 'text-red-600';
                    const eCls = eP === null ? 'text-gray-500' : Math.abs(eP) < 10 ? 'text-green-700' : Math.abs(eP) < 30 ? 'text-orange-600' : 'text-red-600';
                    return (
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                        <td className="py-2.5 pr-4 text-gray-800 sticky left-0 bg-gray-50 whitespace-nowrap z-10">Total</td>
                        <td className="py-2.5 px-2 text-right font-mono text-violet-800 tabular-nums border-l border-gray-200">{tot.ms > 0 ? fmtMoney(tot.ms) : '—'}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-blue-800 tabular-nums border-l border-gray-200">{tot.ai || '—'}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-violet-800 tabular-nums">{tot.mi || '—'}</td>
                        <td className={`py-2.5 px-2 text-right font-mono tabular-nums ${iCls}`}>
                          {iP !== null ? <>{iG > 0 ? '+' : ''}{iG}<span className="text-[9px] ml-0.5 opacity-70">({iG > 0 ? '+' : ''}{iP.toFixed(0)}%)</span></> : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-blue-800 tabular-nums border-l border-gray-200">{tot.ae || '—'}</td>
                        <td className="py-2.5 px-2 text-right font-mono text-violet-800 tabular-nums">{tot.me || '—'}</td>
                        <td className={`py-2.5 px-2 text-right font-mono tabular-nums ${eCls}`}>
                          {eP !== null ? <>{eG > 0 ? '+' : ''}{eG}<span className="text-[9px] ml-0.5 opacity-70">({eG > 0 ? '+' : ''}{eP.toFixed(0)}%)</span></> : '—'}
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </ChartCard>
      )}

      {/* 8. Comparaison Dog Poster / Print to Video / Generic */}
      {creativeGroups.some((g) => g.count > 0) && (() => {
        // Best = lowest CPI / CPI Engagement, highest CTR
        const withData = creativeGroups.filter((g) => g.count > 0);
        const bestCpi     = Math.min(...withData.filter((g) => g.cpi > 0).map((g) => g.cpi));
        const bestCpiEng  = Math.min(...withData.filter((g) => g.cpiEngagement > 0).map((g) => g.cpiEngagement));
        const bestCtr     = Math.max(...withData.filter((g) => g.ctr > 0).map((g) => g.ctr));

        const badge = (val: number, best: number, lowerBetter: boolean) => {
          if (val === 0) return null;
          const isWinner = lowerBetter ? val === best : val === best;
          return isWinner
            ? <span className="ml-1.5 text-[9px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ best</span>
            : null;
        };

        const metricsForChart = (key: 'cpi' | 'cpiEngagement' | 'ctr') =>
          creativeGroups.map((g) => ({ name: g.label, value: g[key], fill: g.color }));

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-900">Comparaison créatifs</h2>
              <span className="text-xs text-gray-400">Dog Poster · Print to Video · Travel Card · Generic</span>
            </div>

            {/* KPI table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wide">Métrique</th>
                      {creativeGroups.map((g) => (
                        <th key={g.key} className="px-4 py-3 text-center font-bold text-gray-800 whitespace-nowrap">
                          <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: g.color }} />
                          {g.label}
                          {g.count > 0
                            ? <span className="ml-1 font-normal text-gray-400 text-[10px]">({g.count} camp.)</span>
                            : <span className="ml-1 font-normal text-gray-300 text-[10px]">(aucune)</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Dépenses', fmt: (g: typeof creativeGroups[0]) => g.cost > 0 ? `$${Math.round(g.cost)}` : '—', highlight: false, lowerBetter: false },
                      { label: 'Installs',  fmt: (g: typeof creativeGroups[0]) => fmtNum(g.installs), highlight: false, lowerBetter: false },
                      { label: 'CPI', fmt: (g: typeof creativeGroups[0]) => g.cpi > 0 ? fmtMoney(g.cpi) : '—', highlight: true, lowerBetter: true, best: bestCpi, key: 'cpi' as const },
                      { label: 'Engagement', fmt: (g: typeof creativeGroups[0]) => fmtNum(g.engagement), highlight: false, lowerBetter: false },
                      { label: 'CPI Engagement', fmt: (g: typeof creativeGroups[0]) => g.cpiEngagement > 0 ? fmtMoney(g.cpiEngagement) : '—', highlight: true, lowerBetter: true, best: bestCpiEng, key: 'cpiEngagement' as const },
                      { label: 'CTR', fmt: (g: typeof creativeGroups[0]) => g.ctr > 0 ? fmtPct(g.ctr) : '—', highlight: true, lowerBetter: false, best: bestCtr, key: 'ctr' as const },
                      { label: 'CPM', fmt: (g: typeof creativeGroups[0]) => g.cpm > 0 ? fmtMoney(g.cpm) : '—', highlight: false, lowerBetter: true },
                      { label: 'Impressions', fmt: (g: typeof creativeGroups[0]) => fmtNum(g.impressions), highlight: false, lowerBetter: false },
                    ].map((row, ri) => (
                      <tr key={row.label} className={`border-b border-gray-50 ${ri % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                        <td className="px-4 py-2.5 font-semibold text-gray-600 whitespace-nowrap">{row.label}</td>
                        {creativeGroups.map((g) => {
                          const val = row.key ? g[row.key] : 0;
                          const isWinner = row.highlight && row.best !== undefined && val > 0 && val === row.best;
                          return (
                            <td key={g.key} className={`px-4 py-2.5 text-center font-mono whitespace-nowrap ${isWinner ? 'font-bold text-green-700 bg-green-50' : 'text-gray-700'}`}>
                              {row.fmt(g)}
                              {isWinner && badge(val, row.best!, row.lowerBetter)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3 mini bar charts: CPI / CPI Engagement / CTR */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { title: 'CPI', dataKey: 'cpi' as const, fmt: (v: number) => `$${v.toFixed(2)}`, note: 'plus bas = meilleur' },
                { title: 'CPI Engagement', dataKey: 'cpiEngagement' as const, fmt: (v: number) => `$${v.toFixed(2)}`, note: 'plus bas = meilleur' },
                { title: 'CTR', dataKey: 'ctr' as const, fmt: (v: number) => `${(v * 100).toFixed(2)}%`, note: 'plus haut = meilleur' },
              ].map(({ title, dataKey, fmt, note }) => {
                const chartData = metricsForChart(dataKey).filter((d) => d.value > 0);
                if (!chartData.length) return null;
                // Shorten labels so they don't overlap (max 8 chars)
                const labelledData = chartData.map((d) => ({ ...d, shortName: d.name.length > 9 ? d.name.slice(0, 8) + '…' : d.name }));
                return (
                  <div key={title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-800 mb-0.5">{title}</p>
                    <p className="text-[10px] text-gray-400 mb-1">{note}</p>
                    {/* Legend strip so full names are readable */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-2">
                      {labelledData.map((d) => (
                        <span key={d.name} className="flex items-center gap-1 text-[9px] text-gray-500">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: d.fill }} />
                          {d.name}
                        </span>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={110}>
                      <BarChart data={labelledData} margin={{ top: 14, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="shortName" tick={{ fontSize: 9, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip formatter={(v: unknown) => [fmt(Number(v)), title]} labelFormatter={(label) => labelledData.find((d) => d.shortName === label)?.name ?? label} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: '#374151', formatter: (v: unknown) => fmt(Number(v)) }}>
                          {labelledData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>

            {/* Campaign list per group */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {creativeGroups.map((g) => (
                <div key={g.key} className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.label}
                    <span className="font-normal text-gray-400">({g.count})</span>
                  </p>
                  {g.campaigns.length === 0
                    ? <p className="text-[11px] text-gray-300">Aucune campagne détectée</p>
                    : <ul className="space-y-0.5">
                        {g.campaigns.map((name) => (
                          <li key={name} className="text-[10px] text-gray-500 truncate" title={name}>· {name.replace(/^Picta_?/i, '')}</li>
                        ))}
                      </ul>
                  }
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* 9. Funnel — visual funnel respecting kpiSegment */}
      {genericFunnel.length > 0 && (() => {
        // Aggregate totals across all platforms
        const tot = {
          impressions: genericFunnel.reduce((s, g) => s + g.impressions, 0),
          clicks:      genericFunnel.reduce((s, g) => s + g.clicks, 0),
          installs:    genericFunnel.reduce((s, g) => s + g.installs, 0),
          engagement:  genericFunnel.reduce((s, g) => s + g.engagement, 0),
          cartAdd:     genericFunnel.reduce((s, g) => s + g.cartAdd, 0),
          checkout:    genericFunnel.reduce((s, g) => s + g.checkout, 0),
          orderPlace:  genericFunnel.reduce((s, g) => s + g.orderPlace, 0),
          cost:        genericFunnel.reduce((s, g) => s + g.cost, 0),
        };

        type StepKey = 'impressions' | 'clicks' | 'installs' | 'engagement' | 'cartAdd' | 'checkout' | 'orderPlace';
        const allSteps: { label: string; key: StepKey; convLabel: string | null; prev: StepKey | null }[] = [
          { label: 'Impressions', key: 'impressions', convLabel: null, prev: null },
          { label: 'Clics',       key: 'clicks',      convLabel: 'CTR',         prev: 'impressions' },
          { label: 'Installs',    key: 'installs',     convLabel: 'Clic → DL',   prev: 'clicks' },
          { label: 'Qualifiés',   key: 'engagement',   convLabel: 'DL → Qual.',  prev: 'installs' },
          ...(tot.cartAdd > 0    ? [{ label: 'Panier',    key: 'cartAdd'   as StepKey, convLabel: 'Qual. → Panier',    prev: 'engagement' as StepKey }] : []),
          ...(tot.checkout > 0   ? [{ label: 'Checkout',  key: 'checkout'  as StepKey, convLabel: 'Panier → Checkout', prev: 'cartAdd'    as StepKey }] : []),
          ...(tot.orderPlace > 0 ? [{ label: 'Commandes', key: 'orderPlace' as StepKey, convLabel: 'Checkout → Cmd.',  prev: 'checkout'   as StepKey }] : []),
        ];
        const maxVal = tot.impressions || 1;

        const segmentLabel = showGenericOnly ? 'Generic' :
          kpiSegment === 'generic'    ? 'Generic' :
          kpiSegment === 'iconic'     ? 'Iconic' :
          kpiSegment === 'other_paid' ? 'Autres paid' :
          kpiSegment === 'noncamp'    ? 'Non-campagnes' : 'Toutes campagnes';

        const cpiChartData    = genericFunnel.filter((g) => g.cpi > 0).map((g) => ({ platform: g.platform, value: +g.cpi.toFixed(2), fill: g.color }));
        const installsChartData = genericFunnel.map((g) => ({ platform: g.platform, value: g.installs, fill: g.color }));

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-gray-900">Funnel</h2>
              <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-semibold">{segmentLabel}</span>
              <span className="text-xs text-gray-400">iOS · Android · Web</span>
              {/* Platform legend */}
              <div className="flex items-center gap-3 ml-auto">
                {genericFunnel.map((g) => (
                  <span key={g.platform} className="flex items-center gap-1 text-[11px] text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: g.color }} />
                    {g.platform}
                    <span className="text-gray-300">({g.campaigns.length})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Visual funnel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-0">
              {allSteps.map((step) => {
                const total = tot[step.key];
                const prevTotal = step.prev ? tot[step.prev] : null;
                const convRate = prevTotal && prevTotal > 0 ? (total / prevTotal) * 100 : null;
                const barWidthPct = Math.max((total / maxVal) * 100, total > 0 ? 1 : 0);

                return (
                  <div key={step.key}>
                    {/* Conversion arrow between steps */}
                    {step.convLabel && (
                      <div className="flex items-center gap-3 py-1 pl-[8.5rem]">
                        <div className="w-px h-4 bg-gray-200 shrink-0" />
                        {convRate !== null ? (
                          <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                            ↓ {step.convLabel} : {convRate.toFixed(1)}%
                          </span>
                        ) : (
                          <span className="text-[11px] text-gray-300">↓ {step.convLabel}</span>
                        )}
                      </div>
                    )}
                    {/* Step row */}
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 w-32 text-right shrink-0">{step.label}</span>
                      {/* Stacked bar by platform */}
                      <div className="flex-1 h-8 bg-gray-50 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full flex rounded-lg overflow-hidden transition-all duration-500"
                          style={{ width: `${barWidthPct}%` }}
                        >
                          {genericFunnel.map((g) => {
                            const share = total > 0 ? g[step.key] / total : 0;
                            return (
                              <div
                                key={g.platform}
                                title={`${g.platform}: ${fmtNum(g[step.key])}`}
                                style={{ width: `${share * 100}%`, backgroundColor: g.color }}
                              />
                            );
                          })}
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold text-gray-700 w-14 shrink-0 tabular-nums">
                        {total > 0 ? fmtNum(total) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* KPI footer */}
              <div className="flex flex-wrap gap-6 pt-5 mt-4 border-t border-gray-100">
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Dépenses</p>
                  <p className="text-sm font-bold text-gray-800">{tot.cost > 0 ? `$${Math.round(tot.cost)}` : '—'}</p>
                </div>
                {tot.installs > 0 && tot.cost > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">CPI moyen</p>
                    <p className="text-sm font-bold text-gray-800">{fmtMoney(tot.cost / tot.installs)}</p>
                  </div>
                )}
                {tot.engagement > 0 && tot.cost > 0 && (
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">CPI Engagés</p>
                    <p className="text-sm font-bold text-gray-800">{fmtMoney(tot.cost / tot.engagement)}</p>
                  </div>
                )}
                {/* Per-platform CPI */}
                {genericFunnel.filter((g) => g.cpi > 0).map((g) => (
                  <div key={g.platform}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                      CPI {g.platform}
                    </p>
                    <p className="text-sm font-bold text-gray-700">{fmtMoney(g.cpi)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Mini bar charts */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {[
                { title: 'Installs',        data: installsChartData,   fmt: (v: number) => String(Math.round(v)) },
                { title: 'Order Placed',    data: genericFunnel.filter((g) => g.orderPlace > 0).map((g) => ({ platform: g.platform, value: g.orderPlace, fill: g.color })), fmt: (v: number) => String(Math.round(v)) },
                { title: 'CPI',             data: cpiChartData,        fmt: (v: number) => `$${v.toFixed(2)}` },
                { title: 'CPI Engagés',     data: genericFunnel.filter((g) => g.cpiEngagement > 0).map((g) => ({ platform: g.platform, value: +g.cpiEngagement.toFixed(2), fill: g.color })), fmt: (v: number) => `$${v.toFixed(2)}` },
                { title: 'Temps moy./user', data: genericFunnel.filter((g) => g.avgTimeSpent > 0).map((g) => ({ platform: g.platform, value: +(g.avgTimeSpent / 60).toFixed(1), fill: g.color })), fmt: (v: number) => `${v}m` },
              ].map(({ title, data, fmt }) => {
                if (!data.length) return null;
                return (
                  <div key={title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-800 mb-3">{title}</p>
                    <ResponsiveContainer width="100%" height={100}>
                      <BarChart data={data} margin={{ top: 14, right: 4, left: 0, bottom: 0 }}>
                        <XAxis dataKey="platform" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip formatter={(v: unknown) => [fmt(Number(v)), title]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#374151', formatter: (v: unknown) => fmt(Number(v)) }}>
                          {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* 10. Creative Funnel — Generic vs Iconic */}
      {creativeVsIconic.hasData && (() => {
        const { generic: G, iconic: IC } = creativeVsIconic;

        type Col = 'generic' | 'iconic';
        type FunnelStep = {
          label: string;
          sub?: string;
          getG: (s: typeof G) => string;
          getI: (s: typeof IC) => string;
          note?: string;
          divider?: boolean;
        };

        const fmtRate = (v: number) => v > 0 ? `${(v * 100).toFixed(1)}%` : '—';
        const fmtCost = (v: number) => v > 0 ? `$${v.toFixed(2)}` : '—';
        const fmtN    = (v: number) => v > 0 ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`) : '—';

        const steps: FunnelStep[] = [
          { label: 'CPM',               getG: (s) => fmtCost(s.cpm),                        getI: (s) => fmtCost(s.cpm),                        note: 'Coût pour 1 000 impressions' },
          { label: 'CTR',               getG: (s) => fmtRate(s.ctr),                        getI: (s) => fmtRate(s.ctr),                        note: 'Clics / Impressions' },
          { label: 'CPI',               getG: (s) => fmtCost(s.cpi),                        getI: (s) => fmtCost(s.cpi),                        note: 'Coût par install', divider: true },
          { label: 'CPI Engagé',        getG: (s) => fmtCost(s.cpiEngagement),              getI: (s) => fmtCost(s.cpiEngagement),              note: 'Coût par engagement' },
          { label: 'Taux engagement',   getG: (s) => fmtRate(s.engRate),                    getI: (s) => fmtRate(s.engRate),                    note: 'Engagement / Installs', divider: true },
          { label: 'Product Detail',    sub: 'Non-unique', getG: (s) => fmtN(s.productDetailOpen),         getI: (s) => fmtN(s.productDetailOpen),         note: 'Vues produit' },
          { label: '',                  sub: 'Unique',     getG: (s) => fmtN(s.productDetailOpenUnique),   getI: (s) => fmtN(s.productDetailOpenUnique),   note: 'Vues produit uniques' },
          { label: 'Taux PD',           sub: 'Unique',     getG: (s) => fmtRate(s.pdUniqueRate),           getI: (s) => fmtRate(s.pdUniqueRate),           note: 'PD unique / Installs', divider: true },
          { label: 'Panier',            sub: 'Non-unique', getG: (s) => fmtN(s.cartAdd),                   getI: (s) => fmtN(s.cartAdd),                   note: 'Add to Cart' },
          { label: '',                  sub: 'Unique',     getG: (s) => fmtN(s.cartAddUnique),             getI: (s) => fmtN(s.cartAddUnique),             note: 'Add to Cart unique' },
          { label: 'Checkout',          sub: 'Non-unique', getG: (s) => fmtN(s.checkout),                  getI: (s) => fmtN(s.checkout),                  note: 'Checkout' },
          { label: '',                  sub: 'Unique',     getG: (s) => fmtN(s.checkoutUnique),            getI: (s) => fmtN(s.checkoutUnique),            note: 'Checkout unique' },
          { label: 'Order',             sub: 'Non-unique', getG: (s) => fmtN(s.orderPlace),                getI: (s) => fmtN(s.orderPlace),                note: 'Order Placed', divider: true },
          { label: '',                  sub: 'Unique',     getG: (s) => fmtN(s.orderPlaceUnique),          getI: (s) => fmtN(s.orderPlaceUnique),          note: 'Order Placed unique' },
          { label: 'Taux Order',        sub: 'Non-unique', getG: (s) => fmtRate(s.ordRate),                getI: (s) => fmtRate(s.ordRate),                note: 'Order / Checkout' },
          { label: '',                  sub: 'Unique',     getG: (s) => fmtRate(s.ordUniqueRate),          getI: (s) => fmtRate(s.ordUniqueRate),          note: 'Order unique / Checkout unique' },
        ];

        const lowerBetter = new Set(['CPM', 'CPI', 'CPI Engagé']);
        function winner(label: string, gVal: string, iVal: string): Col | null {
          const g = parseFloat(gVal.replace(/[$%k]/g, ''));
          const i = parseFloat(iVal.replace(/[$%k]/g, ''));
          if (isNaN(g) || isNaN(i) || g === 0 || i === 0) return null;
          if (lowerBetter.has(label)) return g < i ? 'generic' : 'iconic';
          return g > i ? 'generic' : 'iconic';
        }

        const GENERIC_COLOR = '#f59e0b';
        const ICONIC_COLOR  = '#8b5cf6';

        return (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-gray-900">Funnel Créatifs</h2>
              <span className="text-xs text-gray-400">Generic vs Iconic — events non-uniques (historique) et uniques (tracking plan)</span>
            </div>

            <div className="flex gap-6 text-xs flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: GENERIC_COLOR }} />
                <span className="font-semibold text-amber-700">Generic</span>
                <span className="text-gray-400">({G.count} campagne{G.count > 1 ? 's' : ''})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: ICONIC_COLOR }} />
                <span className="font-semibold text-violet-700">Iconic</span>
                <span className="text-gray-400">({IC.count} campagne{IC.count > 1 ? 's' : ''})</span>
              </div>
              <div className="flex items-center gap-1.5 ml-4">
                <span className="text-green-500 font-bold text-[11px]">★</span>
                <span className="text-gray-400">= meilleur sur la ligne</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-sm">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left font-semibold text-gray-500 uppercase tracking-wide w-36">Métrique</th>
                    <th className="px-3 py-3 text-center font-semibold text-gray-400 text-[10px] w-24">Type</th>
                    <th className="px-4 py-3 text-center w-44">
                      <span className="inline-flex items-center gap-1.5 font-bold text-amber-700">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: GENERIC_COLOR }} />
                        Generic
                      </span>
                    </th>
                    <th className="px-4 py-3 text-center w-44">
                      <span className="inline-flex items-center gap-1.5 font-bold text-violet-700">
                        <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: ICONIC_COLOR }} />
                        Iconic
                      </span>
                    </th>
                    <th className="px-4 py-3 text-left text-gray-400 font-normal hidden sm:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step, si) => {
                    const gVal = step.getG(G);
                    const iVal = step.getI(IC);
                    const effectiveLabel = step.label || (si > 0 ? steps.slice(0, si).reverse().find((s) => s.label)?.label ?? '' : '');
                    const win = winner(effectiveLabel, gVal, iVal);
                    const isSubRow = !step.label;

                    return (
                      <tr
                        key={si}
                        className={[
                          step.divider && si < steps.length - 1 ? 'border-b-2 border-gray-200' : 'border-b border-gray-50',
                          isSubRow ? 'bg-gray-50/30' : si % 2 === 0 ? '' : 'bg-gray-50/10',
                        ].join(' ')}
                      >
                        <td className={`px-4 py-2 font-semibold ${isSubRow ? 'text-gray-400 text-[10px] pl-8' : 'text-gray-700'}`}>
                          {step.label}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {step.sub && (
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium ${
                              step.sub === 'Unique'
                                ? 'bg-indigo-50 text-indigo-600'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {step.sub}
                            </span>
                          )}
                        </td>
                        <td className={`px-4 py-2 text-center font-mono ${
                          win === 'generic'
                            ? 'font-bold text-amber-700 bg-amber-50/60'
                            : gVal === '—' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {win === 'generic' && <span className="mr-1 text-green-500">★</span>}
                          {gVal}
                        </td>
                        <td className={`px-4 py-2 text-center font-mono ${
                          win === 'iconic'
                            ? 'font-bold text-violet-700 bg-violet-50/60'
                            : iVal === '—' ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          {win === 'iconic' && <span className="mr-1 text-green-500">★</span>}
                          {iVal}
                        </td>
                        <td className="px-4 py-2 text-gray-400 hidden sm:table-cell">{step.note ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex gap-8 text-[10px] text-gray-400 flex-wrap">
              {G.count > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-amber-600">Generic :</span>
                  <span>{G.names.map((n) => n.replace(/^Picta_/i, '')).join(', ')}</span>
                </div>
              )}
              {IC.count > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-violet-600">Iconic :</span>
                  <span>{IC.names.map((n) => n.replace(/^Picta_/i, '')).join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 11. Funnel interactif par créatif */}
      {enrichedPaidCampaigns.length > 0 && (() => {
        const activeFunnel = FUNNEL_RATES.find((r) => r.key === funnelRateKey) ?? FUNNEL_RATES[0];
        const maxVal = Math.max(...funnelChartData.map((d) => d.value), 0.001);

        return (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-sm font-bold text-gray-900">Funnel par produit</h2>
              <span className="text-xs text-gray-400">Taux de conversion par campagne — sélectionne une étape du funnel</span>
            </div>

            {/* Creative filter */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mr-1">Créatif :</span>
              {FUNNEL_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFunnelGroupFilter(f.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    funnelGroupFilter === f.key
                      ? 'bg-gray-800 text-white border-gray-800'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Funnel step selector */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mr-1">Étape :</span>
              {FUNNEL_RATES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setFunnelRateKey(r.key)}
                  title={r.desc}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                    funnelRateKey === r.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            {funnelChartData.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Aucune donnée pour ce filtre — les events uniques remontent dès que le tracking plan est actif.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  <span className="font-semibold">{activeFunnel.label}</span>
                  <span className="text-gray-400 ml-2">({activeFunnel.desc})</span>
                </p>

                {/* Bar chart */}
                <div className="overflow-x-auto">
                  <div style={{ minWidth: Math.max(funnelChartData.length * 90, 300) }}>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={funnelChartData} margin={{ top: 8, right: 16, bottom: 60, left: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 9, fill: '#6b7280' }}
                          angle={-35}
                          textAnchor="end"
                          interval={0}
                        />
                        <YAxis
                          tickFormatter={(v) => `${(v * 100).toFixed(1)}%`}
                          tick={{ fontSize: 9, fill: '#9ca3af' }}
                          domain={[0, Math.min(maxVal * 1.25, 1)]}
                        />
                        <Tooltip
                          formatter={(v: number | undefined) => [`${((v ?? 0) * 100).toFixed(2)}%`, activeFunnel.label]}
                          labelStyle={{ fontSize: 11, fontWeight: 600 }}
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={60}>
                          {funnelChartData.map((entry, index) => (
                            <Cell key={entry.token} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Ranking table */}
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">#</th>
                        <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Campagne</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide">{activeFunnel.label}</th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Dépenses</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnelChartData.map((row, i) => (
                        <tr key={row.token} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                          <td className="px-3 py-2 text-gray-400 font-mono">{i + 1}</td>
                          <td className="px-3 py-2 text-gray-800 font-medium flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            {row.name}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-bold" style={{ color: COLORS[i % COLORS.length] }}>
                            {(row.value * 100).toFixed(2)}%
                          </td>
                          <td className="px-3 py-2 text-right text-gray-500 font-mono hidden sm:table-cell">
                            {row.cost > 0 ? `$${Math.round(row.cost)}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── §12 Performance journalière ───────────────────────────────────────── */}
      {dailyAggByDate.length > 0 && (() => {
        const DOW = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const getDow = (dateStr: string) => DOW[new Date(dateStr + 'T12:00:00').getDay()];

        const totalCost       = dailyAggByDate.reduce((s, d) => s + d.cost, 0);
        const totalClicks     = dailyAggByDate.reduce((s, d) => s + d.clicks, 0);
        const totalInstalls   = dailyAggByDate.reduce((s, d) => s + d.installs, 0);
        const totalEngagement = dailyAggByDate.reduce((s, d) => s + d.engagement, 0);

        const funnelRows = dailyAggByDate.filter((d) => d.cartAddUnique > 0);
        const fTotalCost   = funnelRows.reduce((s, d) => s + d.cost, 0);
        const fTotalInst   = funnelRows.reduce((s, d) => s + d.installs, 0);
        const fTotalEng    = funnelRows.reduce((s, d) => s + d.engagement, 0);
        const fTotalCart   = funnelRows.reduce((s, d) => s + d.cartAddUnique, 0);
        const fTotalCo     = funnelRows.reduce((s, d) => s + d.checkoutUnique, 0);
        const fTotalOrder  = funnelRows.reduce((s, d) => s + d.orderPlaceUnique, 0);

        const thHead = 'px-3 py-2 text-[10px] font-bold uppercase tracking-wide whitespace-nowrap';
        const tdBase = 'px-3 py-2 font-mono whitespace-nowrap';

        return (
          <div className="space-y-6">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest pt-2 border-t border-gray-100">
              §12 — Performance journalière
            </h3>

            {/* Table 1: Spend / Clics / Downloads / Qualifiés — tous les jours */}
            <div>
              <p className="text-[10px] text-gray-400 mb-2">Spend Meta · Clics · Downloads · Qualifiés — toute la période</p>
              <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className={`${thHead} text-left text-gray-400`}>Date</th>
                      <th className={`${thHead} text-left text-gray-400`}>Jour</th>
                      <th className={`${thHead} text-right text-amber-600`}>Spend</th>
                      <th className={`${thHead} text-right text-sky-500`}>Clics</th>
                      <th className={`${thHead} text-right text-blue-500`}>Downloads</th>
                      <th className={`${thHead} text-right text-purple-500`}>Qualifiés</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailyAggByDate.map((d, i) => {
                      const dlRate  = d.clicks    > 0 ? d.installs   / d.clicks    : null;
                      const qualRate = d.installs  > 0 ? d.engagement / d.installs  : null;
                      const pct = (r: number | null) => r !== null ? `${(r * 100).toFixed(1)}%` : null;
                      return (
                        <tr key={d.date} className={`border-b border-gray-50 ${i % 2 ? 'bg-gray-50/40' : ''}`}>
                          <td className={`${tdBase} text-[10px] text-gray-400 text-left`}>{fmtDate(d.date)}</td>
                          <td className="px-3 py-2 text-gray-600 font-medium text-left">{getDow(d.date)}</td>
                          <td className={`${tdBase} text-right text-amber-600 font-semibold`}>{d.cost > 0 ? `$${Math.round(d.cost)}` : '—'}</td>
                          <td className={`${tdBase} text-right text-sky-500`}>{fmtNum(d.clicks)}</td>
                          <td className={`${tdBase} text-right text-blue-500`}>
                            <div>{fmtNum(d.installs)}</div>
                            {pct(dlRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(dlRate)} des clics</div>}
                          </td>
                          <td className={`${tdBase} text-right text-purple-500 font-semibold`}>
                            <div>{fmtNum(d.engagement)}</div>
                            {pct(qualRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(qualRate)} des DL</div>}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Macro total */}
                    {(() => {
                      const tDlRate   = totalClicks    > 0 ? totalInstalls   / totalClicks    : null;
                      const tQualRate = totalInstalls  > 0 ? totalEngagement / totalInstalls  : null;
                      const pct = (r: number | null) => r !== null ? `${(r * 100).toFixed(1)}%` : null;
                      return (
                        <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                          <td className="px-3 py-2 text-gray-700 text-left">Total</td>
                          <td className="px-3 py-2 text-gray-400 text-[10px] text-left">Macro</td>
                          <td className={`${tdBase} text-right text-amber-600`}>${Math.round(totalCost)}</td>
                          <td className={`${tdBase} text-right text-sky-500`}>{fmtNum(totalClicks)}</td>
                          <td className={`${tdBase} text-right text-blue-500`}>
                            <div>{fmtNum(totalInstalls)}</div>
                            {pct(tDlRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(tDlRate)} des clics</div>}
                          </td>
                          <td className={`${tdBase} text-right text-purple-500`}>
                            <div>{fmtNum(totalEngagement)}</div>
                            {pct(tQualRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(tQualRate)} des DL</div>}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Funnel unique — uniquement les jours avec données */}
            {funnelRows.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-400 mb-1">Funnel unique · à partir du {fmtDate(funnelRows[0].date)}</p>
                <p className="text-[10px] text-amber-500 mb-2">⚡ Tracking événements uniques actif à partir de ce jour</p>
                <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className={`${thHead} text-left text-gray-400`}>Date</th>
                        <th className={`${thHead} text-left text-gray-400`}>Jour</th>
                        <th className={`${thHead} text-right text-amber-600`}>Spend</th>
                        <th className={`${thHead} text-right text-blue-500`}>Downloads</th>
                        <th className={`${thHead} text-right text-purple-500`}>Qualifiés</th>
                        <th className={`${thHead} text-right text-teal-500`}>Panier+</th>
                        <th className={`${thHead} text-right text-red-400`}>Abandon</th>
                        <th className={`${thHead} text-right text-teal-600`}>Checkout</th>
                        <th className={`${thHead} text-right text-green-500`}>Commandes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {funnelRows.map((d, i) => {
                        const abandon      = d.cartAddUnique - d.checkoutUnique;
                        const cartRate     = d.engagement    > 0 ? d.cartAddUnique   / d.engagement    : null;
                        const abandonRate  = d.cartAddUnique > 0 ? abandon            / d.cartAddUnique : null;
                        const coRate       = d.cartAddUnique > 0 ? d.checkoutUnique   / d.cartAddUnique : null;
                        const orderRate    = d.checkoutUnique > 0 ? d.orderPlaceUnique / d.checkoutUnique : null;
                        const pct = (r: number | null) => r !== null ? `${(r * 100).toFixed(1)}%` : null;
                        return (
                          <tr key={d.date} className={`border-b border-gray-50 ${i % 2 ? 'bg-gray-50/40' : ''}`}>
                            <td className={`${tdBase} text-[10px] text-gray-400 text-left`}>{fmtDate(d.date)}</td>
                            <td className="px-3 py-2 text-gray-600 font-medium text-left">{getDow(d.date)}</td>
                            <td className={`${tdBase} text-right text-amber-600 font-semibold`}>{d.cost > 0 ? `$${Math.round(d.cost)}` : '—'}</td>
                            <td className={`${tdBase} text-right text-blue-500`}>{fmtNum(d.installs)}</td>
                            <td className={`${tdBase} text-right text-purple-500 font-semibold`}>{fmtNum(d.engagement)}</td>
                            <td className={`${tdBase} text-right text-teal-500 font-semibold`}>
                              <div>{d.cartAddUnique || '—'}</div>
                              {pct(cartRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(cartRate)} des qual.</div>}
                            </td>
                            <td className={`${tdBase} text-right text-red-400 font-semibold`}>
                              <div>{abandon > 0 ? abandon : '—'}</div>
                              {pct(abandonRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(abandonRate)} du panier</div>}
                            </td>
                            <td className={`${tdBase} text-right text-teal-600`}>
                              <div>{d.checkoutUnique || '—'}</div>
                              {pct(coRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(coRate)} du panier</div>}
                            </td>
                            <td className={`${tdBase} text-right text-green-500 font-bold`}>
                              <div>{d.orderPlaceUnique || '—'}</div>
                              {pct(orderRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(orderRate)} du checkout</div>}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Funnel total */}
                      {(() => {
                        const tCartRate  = fTotalEng   > 0 ? fTotalCart              / fTotalEng   : null;
                        const tAbandRate = fTotalCart  > 0 ? (fTotalCart - fTotalCo)    / fTotalCart : null;
                        const tCoRate    = fTotalCart  > 0 ? fTotalCo                / fTotalCart  : null;
                        const tOrdRate   = fTotalCo    > 0 ? fTotalOrder             / fTotalCo    : null;
                        const pct = (r: number | null) => r !== null ? `${(r * 100).toFixed(1)}%` : null;
                        return (
                          <tr className="bg-gray-50 border-t border-gray-200 font-bold">
                            <td className="px-3 py-2 text-gray-700 text-left">Total</td>
                            <td className="px-3 py-2 text-gray-400 text-[10px] text-left">{funnelRows.length}j</td>
                            <td className={`${tdBase} text-right text-amber-600`}>${Math.round(fTotalCost)}</td>
                            <td className={`${tdBase} text-right text-blue-500`}>{fmtNum(fTotalInst)}</td>
                            <td className={`${tdBase} text-right text-purple-500`}>{fmtNum(fTotalEng)}</td>
                            <td className={`${tdBase} text-right text-teal-500`}>
                              <div>{fTotalCart}</div>
                              {pct(tCartRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(tCartRate)} des qual.</div>}
                            </td>
                            <td className={`${tdBase} text-right text-red-400`}>
                              <div>{fTotalCart - fTotalCo}</div>
                              {pct(tAbandRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(tAbandRate)} du panier</div>}
                            </td>
                            <td className={`${tdBase} text-right text-teal-600`}>
                              <div>{fTotalCo}</div>
                              {pct(tCoRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(tCoRate)} du panier</div>}
                            </td>
                            <td className={`${tdBase} text-right text-green-500`}>
                              <div>{fTotalOrder}</div>
                              {pct(tOrdRate) && <div className="text-[9px] text-gray-400 font-normal leading-none mt-0.5">{pct(tOrdRate)} du checkout</div>}
                            </td>
                          </tr>
                        );
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })()}

    </div>
  );
}
