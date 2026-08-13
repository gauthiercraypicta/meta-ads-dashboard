'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts';
import type { AdjustResponse, AdjustDailyRow, AdjustCampaignSummary } from '@/types/adjust';

// ─── Config ───────────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e'];

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
      const engagement = Math.round(installs * (0.55 + Math.random() * 0.3));
      daily.push({ date, appToken: c.appToken, appName: c.appName, campaignToken: c.token, campaignName: c.name, installs, clicks, impressions, cost, sessions: Math.round(installs * (2 + Math.random() * 3)), engagement });
    }
  }
  const campSummary: AdjustCampaignSummary[] = campaigns.map((c) => {
    const rows = daily.filter((r) => r.campaignToken === c.token);
    const t = rows.reduce((a, r) => ({ installs: a.installs + r.installs, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, cost: a.cost + r.cost, sessions: a.sessions + r.sessions, engagement: a.engagement + r.engagement }), { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0, engagement: 0 });
    return { token: c.token, name: c.name, appName: c.appName, ...t, cpi: t.installs > 0 ? t.cost / t.installs : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0, cpiEngagement: t.engagement > 0 ? t.cost / t.engagement : 0 };
  });
  const t = daily.reduce((a, r) => ({ installs: a.installs + r.installs, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, cost: a.cost + r.cost, sessions: a.sessions + r.sessions, engagement: a.engagement + r.engagement }), { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0, engagement: 0 });
  const totals = { ...t, cpi: t.installs > 0 ? t.cost / t.installs : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0, cpiEngagement: t.engagement > 0 ? t.cost / t.engagement : 0 };
  const prevTotals = { ...totals, installs: Math.round(totals.installs * 0.85), cost: totals.cost * 0.9, engagement: Math.round(totals.engagement * 0.82), cpi: totals.cpi * 1.1, ctr: totals.ctr * 0.97, cpm: totals.cpm * 1.05, cpiEngagement: totals.cpiEngagement * 1.08, sessions: Math.round(totals.sessions * 0.82) };
  return { daily, campaigns: campSummary, totals, prevTotals, apps, currency: 'USD' };
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
  fmt: (c: AdjustCampaignSummary) => string;
}

function CampaignTable({ campaigns, sortKey, sortDir, onSort }: {
  campaigns: AdjustCampaignSummary[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const cols: ColDef[] = [
    { key: 'name',          label: 'Campagne',    fmt: (c) => c.name },
    { key: 'appName',       label: 'App',         fmt: (c) => c.appName },
    { key: 'cost',          label: 'Coût',        fmt: (c) => `$${Number(c.cost ?? 0).toFixed(0)}` },
    { key: 'installs',      label: 'Installs',    fmt: (c) => fmtNum(c.installs) },
    { key: 'cpi',           label: 'CPI',         fmt: (c) => c.cpi > 0 ? fmtMoney(c.cpi) : '—' },
    { key: 'engagement',    label: 'Engagement',  fmt: (c) => fmtNum(c.engagement) },
    {                       label: 'Transfo %',   fmt: (c) => c.installs > 0 ? `${(c.engagement / c.installs * 100).toFixed(1)}%` : '—' },
    { key: 'cpiEngagement', label: 'CPI Engage.', fmt: (c) => c.cpiEngagement > 0 ? fmtMoney(c.cpiEngagement) : '—' },
    { key: 'clicks',        label: 'Clics',       fmt: (c) => fmtNum(c.clicks) },
    { key: 'impressions',   label: 'Impressions', fmt: (c) => fmtNum(c.impressions) },
    { key: 'ctr',           label: 'CTR',         fmt: (c) => fmtPct(c.ctr) },
    { key: 'cpm',           label: 'CPM',         fmt: (c) => fmtMoney(c.cpm) },
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
  const [metaDailyRaw,     setMetaDailyRaw]     = useState<Array<{ date: string; campaignId: string; campaignName: string; installs: number; engagement: number }> | null>(null);
  const [metaLoading,      setMetaLoading]      = useState(false);
  const [metaError,        setMetaError]        = useState<string | null>(null);

  // Tracks which campaign line is currently hovered — read in tooltip render
  const hoveredCampRef = useRef<string | null>(null);

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

  // Fetch Meta daily installs whenever datePreset changes
  useEffect(() => {
    setMetaLoading(true);
    setMetaError(null);
    setMetaDailyRaw(null);
    fetch(`/api/meta-daily-installs?date_preset=${datePreset}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setMetaError(j.error);
        else setMetaDailyRaw(j.rows ?? []);
      })
      .catch((e: unknown) => setMetaError(e instanceof Error ? e.message : 'Erreur Meta'))
      .finally(() => setMetaLoading(false));
  }, [datePreset]);

  // Auto-select first paid campaign when the list changes (new datePreset)
  useEffect(() => {
    setSelectedCampToken(null);
  }, [datePreset]);

  const dailyPoints = useMemo<DailyPoint[]>(() => {
    if (!data) return [];
    const pts = aggregateByDate(data.daily);
    return granularity === 'week' ? toWeekly(pts) : pts;
  }, [data, granularity]);

  const paidCampaigns = useMemo(() =>
    data ? data.campaigns.filter(
      (c) => (c.cost > 0 || c.installs > 0) && /^\d+$/.test(c.token)
    ) : []
  , [data]);

  const sortedCampaigns = useMemo(() => {
    return [...paidCampaigns].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [paidCampaigns, sortKey, sortDir]);

  const campaignCpiLines = useMemo(() => {
    if (!data || !paidCampaigns.length) return { cpiPoints: [], engPoints: [], keys: [] };
    const topCamps = [...paidCampaigns].sort((a, b) => b.installs - a.installs).slice(0, 8);
    const campByToken = new Map(topCamps.map((c) => [c.token, c.name.replace(/^Picta_/i, '').trim().slice(0, 30)]));
    type CampDay = { cost: number; installs: number; engagement: number };
    const acc = new Map<string, Map<string, CampDay>>();
    for (const r of data.daily) {
      const label = campByToken.get(r.campaignToken);
      if (!label) continue;
      if (!acc.has(r.date)) acc.set(r.date, new Map());
      const dayMap = acc.get(r.date)!;
      const e = dayMap.get(label) ?? { cost: 0, installs: 0, engagement: 0 };
      e.cost += r.cost; e.installs += r.installs; e.engagement += r.engagement;
      dayMap.set(label, e);
    }
    const keys = [...campByToken.values()];
    const sorted = Array.from(acc.entries()).sort(([a], [b]) => a.localeCompare(b));
    const cpiPoints = sorted.map(([date, dayMap]) => {
      const pt: Record<string, string | number | null> = { displayDate: fmtDate(date) };
      for (const key of keys) {
        const e = dayMap.get(key);
        pt[key] = e && e.installs > 0 ? +(e.cost / e.installs).toFixed(2) : null;
      }
      return pt;
    });
    const engPoints = sorted.map(([date, dayMap]) => {
      const pt: Record<string, string | number | null> = { displayDate: fmtDate(date) };
      for (const key of keys) {
        const e = dayMap.get(key);
        pt[key] = e && e.engagement > 0 ? +(e.cost / e.engagement).toFixed(2) : null;
      }
      return pt;
    });
    return { cpiPoints, engPoints, keys };
  }, [data, paidCampaigns]);

  // ── Meta vs Adjust comparison for a single campaign ───────────────────────
  const comparisonData = useMemo(() => {
    if (!data || !metaDailyRaw || !selectedCampToken) return [];
    const adjRows = data.daily.filter((r) => r.campaignToken === selectedCampToken);
    // campaignToken IS the Meta campaign ID (confirmed by /^\d+$/ filter on paidCampaigns)
    const metaRows = metaDailyRaw.filter((r) => r.campaignId === selectedCampToken);

    const dates = [...new Set([...adjRows.map((r) => r.date), ...metaRows.map((r) => r.date)])]
      .sort((a, b) => b.localeCompare(a));

    return dates.map((date) => {
      const adjDay = adjRows
        .filter((r) => r.date === date)
        .reduce((s, r) => ({ installs: s.installs + r.installs, engagement: s.engagement + r.engagement }), { installs: 0, engagement: 0 });
      const metaDay = metaRows
        .filter((r) => r.date === date)
        .reduce((s, r) => ({ installs: s.installs + r.installs, engagement: s.engagement + r.engagement }), { installs: 0, engagement: 0 });

      const iGap    = adjDay.installs   - metaDay.installs;
      const iGapPct = metaDay.installs   > 0 ? (iGap / metaDay.installs) * 100   : null;
      const eGap    = adjDay.engagement  - metaDay.engagement;
      const eGapPct = metaDay.engagement > 0 ? (eGap / metaDay.engagement) * 100 : null;

      return { date, displayDate: fmtDate(date), adjInstalls: adjDay.installs, metaInstalls: metaDay.installs, iGap, iGapPct, adjEngagement: adjDay.engagement, metaEngagement: metaDay.engagement, eGap, eGapPct };
    }).filter((r) => r.adjInstalls > 0 || r.metaInstalls > 0 || r.adjEngagement > 0 || r.metaEngagement > 0);
  }, [data, metaDailyRaw, selectedCampToken]);

  // ── Comparaison créatifs : Dog Poster / Print to Video / Generic ──────────
  const CREATIVE_DEFS = [
    { key: 'dog',     label: 'Dog Poster',      color: '#f97316', test: (n: string) => n.includes('dog') },
    { key: 'ptv',     label: 'Print to Video',  color: '#8b5cf6', test: (n: string) => n.includes('print') || n.includes('ptv') },
    { key: 'generic', label: 'Generic',          color: '#06b6d4', test: (n: string) => n.includes('generic') },
  ];

  const creativeGroups = useMemo(() => {
    return CREATIVE_DEFS.map(({ key, label, color, test }) => {
      const matched = paidCampaigns.filter((c) => test(c.name.toLowerCase()));
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
  }, [paidCampaigns]);

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

  // Inline tooltip for campaign charts — reads hoveredCampRef to show only hovered line
  const campMoneyTooltip = ({ active, payload, label }: TtProps) => {
    if (!active || !payload?.length) return null;
    const key = hoveredCampRef.current;
    const item = key ? (payload.find((p) => p.dataKey === key) ?? payload[0]) : payload[0];
    if (!item || item.value == null) return null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs pointer-events-none">
        <p className="font-semibold text-gray-900 mb-1">{label}</p>
        <p style={{ color: item.color }} className="flex justify-between gap-6">
          <span className="font-medium max-w-[180px] truncate">{item.name}</span>
          <span className="font-mono font-semibold shrink-0">{fmtMoney(item.value)}</span>
        </p>
      </div>
    );
  };

  const kpis = [
    { label: 'Coût total',       value: totals.cost,          prev: prevTotals?.cost,          display: `$${Number(totals.cost ?? 0).toFixed(0)}`, lowerIsBetter: true  },
    { label: 'Installs',         value: totals.installs,      prev: prevTotals?.installs,      display: fmtNum(totals.installs),                   lowerIsBetter: false },
    { label: 'CPI',              value: totals.cpi,           prev: prevTotals?.cpi,           display: totals.cpi > 0 ? fmtMoney(totals.cpi) : '—',           lowerIsBetter: true  },
    { label: 'Engage. installs', value: totals.engagement,    prev: prevTotals?.engagement,    display: fmtNum(totals.engagement),                 lowerIsBetter: false },
    { label: 'CPI Engagement',   value: totals.cpiEngagement, prev: prevTotals?.cpiEngagement, display: totals.cpiEngagement > 0 ? fmtMoney(totals.cpiEngagement) : '—', lowerIsBetter: true },
    { label: 'Clics',            value: totals.clicks,        prev: prevTotals?.clicks,        display: fmtNum(totals.clicks),                     lowerIsBetter: false },
    { label: 'Impressions',      value: totals.impressions,   prev: prevTotals?.impressions,   display: fmtNum(totals.impressions),                lowerIsBetter: false },
    { label: 'CPM',              value: totals.cpm,           prev: prevTotals?.cpm,           display: fmtMoney(totals.cpm),                      lowerIsBetter: true  },
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
        <div className="ml-auto flex gap-0.5 bg-gray-100 rounded-lg p-1">
          {(['day', 'week'] as Granularity[]).map((g) => (
            <button key={g} onClick={() => setGranularity(g)}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${granularity === g ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {g === 'day' ? 'Jour' : 'Semaine'}
            </button>
          ))}
        </div>
      </div>

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

      {/* 3. Installs quotidiennes + Install Engagement */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Installs quotidiennes" subtitle="Volume d'installs attribuées via Adjust">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis {...AXIS_COMMON} width={35} />
              <Tooltip content={<NumTooltip />} />
              <Bar dataKey="installs" name="Installs" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              {avgInstalls > 0 && (
                <ReferenceLine y={avgInstalls} {...REFLINE_STYLE}
                  label={{ value: `moy. ${Math.round(avgInstalls)}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Install Engagement" subtitle="Événement install_engagement par jour">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyPoints} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis {...AXIS_COMMON} width={35} />
              <Tooltip content={<NumTooltip />} />
              <Bar dataKey="engagement" name="Engagement" fill="#10b981" radius={[3, 3, 0, 0]} />
              {avgEngagement > 0 && (
                <ReferenceLine y={avgEngagement} {...REFLINE_STYLE}
                  label={{ value: `moy. ${Math.round(avgEngagement)}`, position: 'insideTopRight', fontSize: 10, fill: '#94a3b8' }} />
              )}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

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
                  <Tooltip content={campMoneyTooltip} />
                  {campaignCpiLines.keys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} name={key}
                      stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls
                      hide={hiddenCamps.has(key)}
                      onMouseEnter={() => { hoveredCampRef.current = key; }}
                      onMouseLeave={() => { hoveredCampRef.current = null; }}
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
                  <Tooltip content={campMoneyTooltip} />
                  {campaignCpiLines.keys.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} name={key}
                      stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls
                      hide={hiddenCamps.has(key)}
                      onMouseEnter={() => { hoveredCampRef.current = key; }}
                      onMouseLeave={() => { hoveredCampRef.current = null; }}
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
      {paidCampaigns.length > 0 && (
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
              <option value="">— Choisir une campagne —</option>
              {paidCampaigns.map((c) => (
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
                    <th colSpan={3} className="text-center py-2 px-3 font-semibold text-blue-600 border-l border-gray-200">App Installs</th>
                    <th colSpan={3} className="text-center py-2 px-3 font-semibold text-violet-600 border-l border-gray-200">App Install Engagement</th>
                  </tr>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-[10px] text-gray-400">
                    <th className="sticky left-0 bg-gray-50 py-1.5" />
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
                        {/* Installs */}
                        <td className="py-2 px-2 text-right font-mono text-blue-700 tabular-nums border-l border-gray-200">
                          {row.adjInstalls > 0 ? row.adjInstalls : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-violet-700 tabular-nums">
                          {row.metaInstalls > 0 ? row.metaInstalls : <span className="text-gray-200">—</span>}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono tabular-nums ${iCls}`}>
                          {row.iGapPct !== null
                            ? <>{row.iGap > 0 ? '+' : ''}{row.iGap}<span className="text-[9px] ml-0.5 opacity-70">({row.iGap > 0 ? '+' : ''}{row.iGapPct.toFixed(0)}%)</span></>
                            : row.adjInstalls > 0 && row.metaInstalls === 0 ? <span className="text-gray-300">—</span>
                            : '—'}
                        </td>
                        {/* Engagement */}
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
              <span className="text-xs text-gray-400">Dog Poster · Print to Video · Generic</span>
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
                return (
                  <div key={title} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                    <p className="text-xs font-semibold text-gray-800 mb-0.5">{title}</p>
                    <p className="text-[10px] text-gray-400 mb-3">{note}</p>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <YAxis hide />
                        <Tooltip formatter={(v: unknown) => [fmt(Number(v)), title]} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#374151', formatter: (v: unknown) => fmt(Number(v)) }}>
                          {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
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

    </div>
  );
}
