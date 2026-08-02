'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';
import type { AdjustResponse, AdjustDailyRow, AdjustCampaignSummary } from '@/types/adjust';

// ─── Config ───────────────────────────────────────────────────────────────────

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#06b6d4', '#84cc16', '#f43f5e'];

// ─── Mock data ────────────────────────────────────────────────────────────────

function generateMock(): AdjustResponse {
  const today = new Date();
  const DAYS  = 30;
  const apps  = [
    { token: 'iosapp1', name: 'Picta iOS' },
    { token: 'andapp1', name: 'Picta Android' },
  ];
  const campaigns = [
    { token: 'c1', name: 'UA_iOS_Broad',       appToken: 'iosapp1', appName: 'Picta iOS' },
    { token: 'c2', name: 'UA_iOS_Retarget',     appToken: 'iosapp1', appName: 'Picta iOS' },
    { token: 'c3', name: 'UA_Android_Broad',    appToken: 'andapp1', appName: 'Picta Android' },
    { token: 'c4', name: 'UA_Android_Retarget', appToken: 'andapp1', appName: 'Picta Android' },
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
      daily.push({ date, appToken: c.appToken, appName: c.appName, campaignToken: c.token, campaignName: c.name, installs, clicks, impressions, cost, sessions: Math.round(installs * (2 + Math.random() * 3)) });
    }
  }
  const campSummary: AdjustCampaignSummary[] = campaigns.map((c) => {
    const rows = daily.filter((r) => r.campaignToken === c.token);
    const t = rows.reduce((a, r) => ({ installs: a.installs + r.installs, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, cost: a.cost + r.cost, sessions: a.sessions + r.sessions }), { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0 });
    return { token: c.token, name: c.name, appName: c.appName, ...t, cpi: t.installs > 0 ? t.cost / t.installs : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0 };
  });
  const t = daily.reduce((a, r) => ({ installs: a.installs + r.installs, clicks: a.clicks + r.clicks, impressions: a.impressions + r.impressions, cost: a.cost + r.cost, sessions: a.sessions + r.sessions }), { installs: 0, clicks: 0, impressions: 0, cost: 0, sessions: 0 });
  const totals = { ...t, cpi: t.installs > 0 ? t.cost / t.installs : 0, ctr: t.impressions > 0 ? t.clicks / t.impressions : 0, cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0 };
  const prevTotals = { ...totals, installs: Math.round(totals.installs * 0.85), cost: totals.cost * 0.9, cpi: totals.cpi * 1.1, ctr: totals.ctr * 0.97, cpm: totals.cpm * 1.05, sessions: Math.round(totals.sessions * 0.82) };
  return { daily, campaigns: campSummary, totals, prevTotals, apps, currency: 'USD' };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtMoney = (v: number) => v === 0 ? '—' : `$${v.toFixed(2)}`;
const fmtNum   = (v: number) => v === 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`;
const fmtPct   = (v: number) => `${(v * 100).toFixed(2)}%`;
const fmtDate  = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// ─── Chart helpers ────────────────────────────────────────────────────────────

type Granularity = 'day' | 'week';

interface DailyPoint {
  date: string;
  displayDate: string;
  installs: number;
  clicks: number;
  impressions: number;
  cost: number;
  sessions: number;
  cpi: number;
  ctr: number;
  cpm: number;
}

function aggregateByDate(rows: AdjustDailyRow[]): DailyPoint[] {
  const map = new Map<string, { installs: number; clicks: number; impressions: number; cost: number; sessions: number }>();
  for (const r of rows) {
    const e = map.get(r.date);
    if (!e) map.set(r.date, { installs: r.installs, clicks: r.clicks, impressions: r.impressions, cost: r.cost, sessions: r.sessions });
    else { e.installs += r.installs; e.clicks += r.clicks; e.impressions += r.impressions; e.cost += r.cost; e.sessions += r.sessions; }
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({
    date, displayDate: fmtDate(date), ...t,
    cpi: t.installs   > 0 ? t.cost / t.installs    : 0,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
  }));
}

function toWeekly(pts: DailyPoint[]): DailyPoint[] {
  const weeks = new Map<string, { installs: number; clicks: number; impressions: number; cost: number; sessions: number; displayDate: string }>();
  for (const p of pts) {
    const d = new Date(p.date + 'T12:00:00');
    const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const wk = mon.toISOString().split('T')[0];
    const disp = `S ${mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`;
    const e = weeks.get(wk);
    if (!e) weeks.set(wk, { installs: p.installs, clicks: p.clicks, impressions: p.impressions, cost: p.cost, sessions: p.sessions, displayDate: disp });
    else { e.installs += p.installs; e.clicks += p.clicks; e.impressions += p.impressions; e.cost += p.cost; e.sessions += p.sessions; }
  }
  return Array.from(weeks.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, t]) => ({
    date, ...t,
    cpi: t.installs   > 0 ? t.cost / t.installs    : 0,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : 0,
    cpm: t.impressions > 0 ? (t.cost / t.impressions) * 1000 : 0,
  }));
}

// ─── Shared chart props ───────────────────────────────────────────────────────

const AXIS_TICK   = { fontSize: 11, fill: '#9CA3AF' };
const AXIS_COMMON = { axisLine: false as const, tickLine: false as const, tick: AXIS_TICK };

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

interface TtProps { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }

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

type SortKey = keyof AdjustCampaignSummary;
type SortDir = 'asc' | 'desc';

function CampaignTable({ campaigns, sortKey, sortDir, onSort }: { campaigns: AdjustCampaignSummary[]; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void }) {
  const cols: { key: SortKey; label: string; fmt: (c: AdjustCampaignSummary) => string }[] = [
    { key: 'name',        label: 'Campagne',     fmt: (c) => c.name },
    { key: 'appName',     label: 'App',          fmt: (c) => c.appName },
    { key: 'cost',        label: 'Coût',         fmt: (c) => `$${c.cost.toFixed(0)}` },
    { key: 'installs',    label: 'Installs',     fmt: (c) => fmtNum(c.installs) },
    { key: 'cpi',         label: 'CPI',          fmt: (c) => c.cpi > 0 ? fmtMoney(c.cpi) : '—' },
    { key: 'clicks',      label: 'Clics',        fmt: (c) => fmtNum(c.clicks) },
    { key: 'impressions', label: 'Impressions',  fmt: (c) => fmtNum(c.impressions) },
    { key: 'ctr',         label: 'CTR',          fmt: (c) => fmtPct(c.ctr) },
    { key: 'cpm',         label: 'CPM',          fmt: (c) => fmtMoney(c.cpm) },
    { key: 'sessions',    label: 'Sessions',     fmt: (c) => fmtNum(c.sessions) },
  ];
  if (!campaigns.length) return <p className="text-sm text-gray-400 py-6 text-center">Aucune campagne.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            {cols.map((c) => (
              <th key={c.key} onClick={() => onSort(c.key)} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 whitespace-nowrap select-none">
                {c.label}{sortKey === c.key && <span className="ml-1 text-blue-500">{sortDir === 'desc' ? '↓' : '↑'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {campaigns.map((camp, i) => (
            <tr key={camp.token} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}>
              {cols.map((c) => (
                <td key={c.key} className={`px-3 py-2.5 font-mono text-gray-700 ${c.key === 'name' ? 'font-sans text-gray-800 font-medium max-w-[200px] truncate' : ''}`}>
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
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [sortKey,     setSortKey]     = useState<SortKey>('cost');
  const [sortDir,     setSortDir]     = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/adjust?date_preset=${datePreset}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
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

  const sortedCampaigns = useMemo(() => {
    if (!data) return [];
    return [...data.campaigns].sort((a, b) => {
      const diff = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [data, sortKey, sortDir]);

  const campaignBars = useMemo(() => {
    if (!data) return [];
    return data.campaigns.map((c) => ({
      name: c.name.replace(/UA_|Picta_?/gi, '').trim().slice(0, 18),
      CPI:  +c.cpi.toFixed(2),
      CPM:  +c.cpm.toFixed(2),
    }));
  }, [data]);

  if (loading) {
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const kpis = [
    { label: 'Coût total',   value: totals.cost,        prev: prevTotals?.cost,        display: `$${totals.cost.toFixed(0)}`,        lowerIsBetter: true  },
    { label: 'Installs',     value: totals.installs,    prev: prevTotals?.installs,    display: fmtNum(totals.installs),             lowerIsBetter: false },
    { label: 'CPI',          value: totals.cpi,         prev: prevTotals?.cpi,         display: totals.cpi > 0 ? fmtMoney(totals.cpi) : '—', lowerIsBetter: true },
    { label: 'Clics',        value: totals.clicks,      prev: prevTotals?.clicks,      display: fmtNum(totals.clicks),               lowerIsBetter: false },
    { label: 'CTR',          value: totals.ctr,         prev: prevTotals?.ctr,         display: fmtPct(totals.ctr),                  lowerIsBetter: false },
    { label: 'Impressions',  value: totals.impressions, prev: prevTotals?.impressions, display: fmtNum(totals.impressions),          lowerIsBetter: false },
    { label: 'CPM',          value: totals.cpm,         prev: prevTotals?.cpm,         display: fmtMoney(totals.cpm),                lowerIsBetter: true  },
    { label: 'Sessions',     value: totals.sessions,    prev: prevTotals?.sessions,    display: fmtNum(totals.sessions),             lowerIsBetter: false },
  ];

  return (
    <div className="space-y-6">

      {/* Error / mock banner */}
      {error && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
          <span className="mt-0.5 flex-shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="font-semibold">Adjust — données de démonstration</p>
            <p className="text-amber-700 mt-0.5 text-xs">{error}</p>
            <p className="text-amber-700 mt-1 text-xs">
              Configure <code className="bg-amber-100 px-1 rounded">ADJUST_API_TOKEN</code> et <code className="bg-amber-100 px-1 rounded">ADJUST_APP_TOKENS</code> dans Vercel pour activer les données réelles.
            </p>
          </div>
          <button onClick={fetchData} className="text-xs font-medium underline hover:no-underline flex-shrink-0">Réessayer</button>
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

      {/* 2. Installs + Coût */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="Installs quotidiennes" subtitle="Volume d'installs attribuées via Adjust">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis {...AXIS_COMMON} width={35} />
              <Tooltip content={<NumTooltip />} />
              <Bar dataKey="installs" name="Installs" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Coût journalier" subtitle="Budget consommé par jour (USD)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `$${v.toFixed(0)}`} {...AXIS_COMMON} width={46} />
              <Tooltip content={<MoneyTooltip />} />
              <Line type="monotone" dataKey="cost" name="Coût ($)" stroke="#f97316" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 3. CPI + CTR */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartCard title="CPI (Coût par install)" subtitle="Évolution du coût d'acquisition">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `$${(v as number).toFixed(1)}`} {...AXIS_COMMON} width={46} />
              <Tooltip content={<MoneyTooltip />} />
              <Line type="monotone" dataKey="cpi" name="CPI ($)" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CTR (Click-through rate)" subtitle="Qualité des annonces — clics / impressions">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyPoints} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
              <XAxis dataKey="displayDate" {...AXIS_COMMON} interval="preserveStartEnd" />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(2)}%`} {...AXIS_COMMON} width={52} />
              <Tooltip formatter={(v: unknown) => typeof v === 'number' ? [`${(v * 100).toFixed(3)}%`, 'CTR'] : '—'} />
              <Line type="monotone" dataKey="ctr" name="CTR" stroke="#8b5cf6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* 4. Comparison par campagne */}
      <ChartCard title="CPI & CPM par campagne" subtitle="Comparaison du coût d'acquisition et du coût média">
        <ResponsiveContainer width="100%" height={Math.max(180, campaignBars.length * 48)}>
          <BarChart data={campaignBars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
            <XAxis type="number" tickFormatter={(v) => `$${v.toFixed(0)}`} {...AXIS_COMMON} />
            <YAxis dataKey="name" type="category" {...AXIS_COMMON} width={100} tick={{ ...AXIS_TICK, fontSize: 10 }} />
            <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `$${v.toFixed(2)}` : '—'} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="CPI" fill="#3b82f6" radius={[0, 3, 3, 0]}>
              {campaignBars.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
            <Bar dataKey="CPM" fill="#f97316" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* 5. Campaign table */}
      <ChartCard title="Tableau par campagne" subtitle="Cliquer sur un en-tête pour trier">
        <CampaignTable campaigns={sortedCampaigns} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
      </ChartCard>

    </div>
  );
}
