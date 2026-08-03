'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
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
  const [hiddenCamps, setHiddenCamps] = useState<Set<string>>(new Set());

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

    </div>
  );
}
