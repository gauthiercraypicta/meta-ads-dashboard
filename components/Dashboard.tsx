'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import MetricCard from './MetricCard';
import DataTable, { Column } from './DataTable';
import DailyChart from './DailyChart';
import BudgetPacing from './BudgetPacing';
import FunnelDiagnostic from './FunnelDiagnostic';
import { Campaign, AdSet, ProcessedCampaign, ProcessedAdSet, ProcessedMetrics } from '@/types/meta';
import { processInsights, computeTotals, getStatusColor } from '@/lib/metaHelpers';
import { formatCurrency, formatNumber, formatPercent, formatROAS } from '@/lib/formatters';

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconDollar() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
function IconEye() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}
function IconUsers() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function IconCursor() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
    </svg>
  );
}
function IconPercent() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}
function IconTag() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
    </svg>
  );
}
function IconShoppingCart() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
function IconTrendUp() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
    </svg>
  );
}
function IconAward() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </svg>
  );
}
function IconRepeat() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}
function IconRefresh({ spin }: { spin?: boolean }) {
  return (
    <svg className={`w-4 h-4 ${spin ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

// ─── Badge helpers (module-level, no closures needed) ─────────────────────────

function roasBadge(roas: number): ReactNode {
  let cls = 'bg-gray-100 text-gray-500';
  if (roas >= 5)      cls = 'bg-blue-100 text-blue-700';
  else if (roas >= 3) cls = 'bg-green-100 text-green-700';
  else if (roas >= 2) cls = 'bg-orange-100 text-orange-700';
  else if (roas > 0)  cls = 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold font-mono ${cls}`}>
      {formatROAS(roas)}
    </span>
  );
}

function ctrBadge(ctr: number): ReactNode {
  let cls = 'text-red-600';
  if (ctr > 1)    cls = 'text-green-600';
  else if (ctr >= 0.5) cls = 'text-orange-500';
  return <span className={`font-mono text-xs font-semibold ${cls}`}>{formatPercent(ctr)}</span>;
}

function cpmBadge(cpm: number): ReactNode {
  let cls = 'text-green-600';
  if (cpm > 15)   cls = 'text-red-600';
  else if (cpm >= 8) cls = 'text-orange-500';
  return <span className={`font-mono text-xs font-semibold ${cls}`}>{formatCurrency(cpm)}</span>;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(status)}`}>
      {status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />}
      {status}
    </span>
  );
}

// ─── Static Ad Set columns (no dependency on component state) ─────────────────

const adsetColumns: Column<ProcessedAdSet>[] = [
  {
    key: 'name',
    header: 'Ad Set',
    sortable: true,
    render: (row) => (
      <div>
        <p className="font-semibold text-gray-900 max-w-xs truncate">{row.name}</p>
        <p className="text-xs text-gray-400 font-mono">{row.id}</p>
      </div>
    ),
  },
  {
    key: 'status',
    header: 'Statut',
    sortable: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  { key: 'spend',           header: 'Dépenses',    sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-800">{formatCurrency(row.spend)}</span> },
  { key: 'conversionValue', header: 'Val. conv.',   sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatCurrency(row.conversionValue)}</span> },
  { key: 'roas',            header: 'ROAS',         sortable: true, align: 'right', render: (row) => roasBadge(row.roas) },
  { key: 'cpa',             header: 'CPA',          sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{row.cpa > 0 ? formatCurrency(row.cpa) : '—'}</span> },
  { key: 'ctr',             header: 'CTR',          sortable: true, align: 'right', render: (row) => ctrBadge(row.ctr) },
  { key: 'cpm',             header: 'CPM',          sortable: true, align: 'right', render: (row) => cpmBadge(row.cpm) },
  { key: 'cpc',             header: 'CPC',          sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatCurrency(row.cpc)}</span> },
  { key: 'impressions',     header: 'Impressions',  sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatNumber(row.impressions)}</span> },
  { key: 'clicks',          header: 'Clics',        sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatNumber(row.clicks)}</span> },
  { key: 'conversions',     header: 'Conv.',        sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatNumber(row.conversions)}</span> },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type DatePreset = 'last_7d' | 'last_30d' | 'last_90d';

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'last_7d', label: '7 jours' },
  { value: 'last_30d', label: '30 jours' },
  { value: 'last_90d', label: '90 jours' },
];

const PERIOD_LABELS: Record<DatePreset, string> = {
  last_7d: '7 derniers jours',
  last_30d: '30 derniers jours',
  last_90d: '90 derniers jours',
};

interface FetchErrors {
  campaigns?: string;
  adsets?: string;
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const [campaigns, setCampaigns]     = useState<Campaign[]>([]);
  const [adsets, setAdsets]           = useState<AdSet[]>([]);
  const [loading, setLoading]         = useState(true);
  const [errors, setErrors]           = useState<FetchErrors>({});
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab]     = useState<'campaigns' | 'adsets'>('campaigns');
  const [refreshKey, setRefreshKey]   = useState(0);
  const [datePreset, setDatePreset]   = useState<DatePreset>('last_30d');
  const [comparison, setComparison]   = useState<ProcessedMetrics | null>(null);
  const [currentAcc, setCurrentAcc]   = useState<ProcessedMetrics | null>(null); // account-level current period (for deltas)
  const [focusedKpi, setFocusedKpi]   = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrors({});

    const [campaignsResult, adsetsResult, prevResult, currAccResult] = await Promise.allSettled([
      fetch(`/api/campaigns?date_preset=${datePreset}`).then((r) => r.json()),
      fetch(`/api/adsets?date_preset=${datePreset}`).then((r) => r.json()),
      fetch(`/api/account-insights?date_preset=${datePreset}&mode=previous`).then((r) => r.json()),
      fetch(`/api/account-insights?date_preset=${datePreset}`).then((r) => r.json()),
    ]);

    const newErrors: FetchErrors = {};

    if (campaignsResult.status === 'fulfilled') {
      if (campaignsResult.value.error) newErrors.campaigns = campaignsResult.value.error;
      else setCampaigns(campaignsResult.value.data ?? []);
    } else {
      newErrors.campaigns = 'Impossible de joindre /api/campaigns';
    }

    if (adsetsResult.status === 'fulfilled') {
      if (adsetsResult.value.error) newErrors.adsets = adsetsResult.value.error;
      else setAdsets(adsetsResult.value.data ?? []);
    } else {
      newErrors.adsets = 'Impossible de joindre /api/adsets';
    }

    if (
      prevResult.status === 'fulfilled' &&
      !prevResult.value.error &&
      prevResult.value.data?.[0]
    ) {
      setComparison(processInsights(prevResult.value.data[0]));
    } else {
      setComparison(null);
    }

    if (
      currAccResult.status === 'fulfilled' &&
      !currAccResult.value.error &&
      currAccResult.value.data?.[0]
    ) {
      setCurrentAcc(processInsights(currAccResult.value.data[0]));
    } else {
      setCurrentAcc(null);
    }

    setErrors(newErrors);
    setLastUpdated(new Date());
    setLoading(false);
    setRefreshKey((k) => k + 1);
  }, [datePreset]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derivations ────────────────────────────────────────────────────────────

  const processedCampaigns: ProcessedCampaign[] = useMemo(
    () =>
      campaigns.map((c) => ({
        id: c.id, name: c.name, status: c.status, objective: c.objective,
        ...processInsights(c.insights?.data[0]),
      })),
    [campaigns]
  );

  const processedAdsets: ProcessedAdSet[] = useMemo(
    () =>
      adsets.map((a) => ({
        id: a.id, name: a.name, status: a.status, campaign_id: a.campaign_id,
        ...processInsights(a.insights?.data[0]),
      })),
    [adsets]
  );

  const activeCampaigns = useMemo(
    () => processedCampaigns.filter((c) => c.spend > 0 || c.impressions > 0),
    [processedCampaigns]
  );

  const activeAdsets = useMemo(
    () => processedAdsets.filter((a) => a.spend > 0 || a.impressions > 0),
    [processedAdsets]
  );

  const hiddenCampaignsCount = processedCampaigns.length - activeCampaigns.length;
  const hiddenAdsetsCount    = processedAdsets.length - activeAdsets.length;

  const totals = useMemo(
    () => computeTotals(processedCampaigns.map((c) => ({ ...c }))),
    [processedCampaigns]
  );

  // CVR = conversions / clicks × 100
  const cvr = useMemo(
    () => (totals.clicks > 0 ? (totals.conversions / totals.clicks) * 100 : 0),
    [totals]
  );

  // ── Delta helper ──────────────────────────────────────────────────────────
  // Uses account-level insights for BOTH current and previous so the two
  // periods come from the same data source (avoids campaigns vs account-level
  // discrepancies, especially for derived metrics like ROAS and CPA).

  const calcDelta = useCallback((
    accKey: keyof ProcessedMetrics,
    fallbackCurrent?: number,
  ): number | undefined => {
    if (!comparison || !currentAcc) return undefined;
    const curr = currentAcc[accKey] ?? fallbackCurrent ?? 0;
    const prev = comparison[accKey] ?? 0;
    if (prev === 0) return undefined;
    return ((curr - prev) / Math.abs(prev)) * 100;
  }, [comparison, currentAcc]);

  // ── Campaign columns (depends on totals) ──────────────────────────────────

  const campaignColumns = useMemo((): Column<ProcessedCampaign>[] => [
    {
      key: 'name',
      header: 'Campagne',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-gray-900 max-w-xs truncate">{row.name}</p>
          <p className="text-xs text-gray-400 font-mono">{row.id}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'objective',
      header: 'Objectif',
      sortable: true,
      render: (row) => (
        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          {row.objective ?? '—'}
        </span>
      ),
    },
    {
      key: 'spend',
      header: 'Dépenses',
      sortable: true,
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <p className="font-mono text-sm text-gray-800">{formatCurrency(row.spend)}</p>
          {totals.spend > 0 && (
            <p className="text-[10px] text-gray-400 font-mono">
              {((row.spend / totals.spend) * 100).toFixed(1)}% du total
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'conversionValue',
      header: 'Val. conv.',
      sortable: true,
      align: 'right',
      render: (row) => (
        <div className="text-right">
          <p className="font-mono text-sm text-gray-800">{formatCurrency(row.conversionValue)}</p>
          {totals.conversionValue > 0 && (
            <p className="text-[10px] text-gray-400 font-mono">
              {((row.conversionValue / totals.conversionValue) * 100).toFixed(1)}% du total
            </p>
          )}
        </div>
      ),
    },
    { key: 'roas',        header: 'ROAS',        sortable: true, align: 'right', render: (row) => roasBadge(row.roas) },
    { key: 'cpa',         header: 'CPA',          sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{row.cpa > 0 ? formatCurrency(row.cpa) : '—'}</span> },
    { key: 'ctr',         header: 'CTR',          sortable: true, align: 'right', render: (row) => ctrBadge(row.ctr) },
    { key: 'cpm',         header: 'CPM',          sortable: true, align: 'right', render: (row) => cpmBadge(row.cpm) },
    { key: 'cpc',         header: 'CPC',          sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatCurrency(row.cpc)}</span> },
    { key: 'impressions', header: 'Impressions',  sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatNumber(row.impressions)}</span> },
    { key: 'conversions', header: 'Conv.',         sortable: true, align: 'right', render: (row) => <span className="font-mono text-sm text-gray-700">{formatNumber(row.conversions)}</span> },
  ], [totals]);

  // ── Expandable ad-set rows (depends on activeAdsets) ─────────────────────

  const renderExpanded = useCallback((campaign: ProcessedCampaign): ReactNode => {
    const campAdsets = activeAdsets.filter((a) => a.campaign_id === campaign.id);
    if (!campAdsets.length) {
      return (
        <div className="px-6 py-2.5 text-xs text-gray-400 bg-blue-50/20 border-t border-blue-100 italic">
          Aucun ad set actif sur cette période.
        </div>
      );
    }
    return (
      <div className="bg-blue-50/20 border-t border-blue-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-blue-50/50">
              <th className="py-2 pl-10 pr-4 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Ad Set</th>
              <th className="py-2 px-4 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Statut</th>
              <th className="py-2 px-4 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Dépenses</th>
              <th className="py-2 px-4 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Val. conv.</th>
              <th className="py-2 px-4 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">ROAS</th>
              <th className="py-2 px-4 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">CTR</th>
              <th className="py-2 px-4 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">CPA</th>
              <th className="py-2 px-4 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Conv.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-blue-100/60">
            {campAdsets.map((a) => (
              <tr key={a.id} className="hover:bg-blue-50 transition-colors">
                <td className="py-2 pl-10 pr-4">
                  <p className="font-semibold text-gray-800 truncate max-w-[260px]">{a.name}</p>
                </td>
                <td className="py-2 px-4"><StatusBadge status={a.status} /></td>
                <td className="py-2 px-4 text-right font-mono text-gray-700">{formatCurrency(a.spend)}</td>
                <td className="py-2 px-4 text-right font-mono text-gray-700">{formatCurrency(a.conversionValue)}</td>
                <td className="py-2 px-4 text-right">{roasBadge(a.roas)}</td>
                <td className="py-2 px-4 text-right">{ctrBadge(a.ctr)}</td>
                <td className="py-2 px-4 text-right font-mono text-gray-700">{a.cpa > 0 ? formatCurrency(a.cpa) : '—'}</td>
                <td className="py-2 px-4 text-right font-mono text-gray-700">{formatNumber(a.conversions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [activeAdsets]);

  // ── Cards data ────────────────────────────────────────────────────────────

  const bigCards = [
    {
      title: 'Dépenses totales',
      value: formatCurrency(totals.spend),
      icon: <IconDollar />,
      colorClass: 'bg-blue-100 text-blue-600',
      delta: calcDelta('spend'),
    },
    {
      title: 'Val. conversions',
      value: formatCurrency(totals.conversionValue),
      icon: <IconTrendUp />,
      colorClass: 'bg-emerald-100 text-emerald-600',
      delta: calcDelta('conversionValue'),
    },
    {
      title: 'ROAS',
      value: formatROAS(totals.roas),
      icon: <IconAward />,
      colorClass: 'bg-rose-100 text-rose-600',
      delta: calcDelta('roas'),
    },
    {
      title: 'CPA',
      value: totals.cpa > 0 ? formatCurrency(totals.cpa) : '—',
      icon: <IconTag />,
      colorClass: 'bg-amber-100 text-amber-600',
      delta: calcDelta('cpa'),
      invertDelta: true,
    },
  ];

  const smallCards = [
    {
      title: 'Impressions',
      value: formatNumber(totals.impressions),
      icon: <IconEye />,
      colorClass: 'bg-indigo-100 text-indigo-600',
      delta: calcDelta('impressions'),
    },
    {
      title: 'Portée',
      value: formatNumber(totals.reach),
      icon: <IconUsers />,
      colorClass: 'bg-violet-100 text-violet-600',
      delta: calcDelta('reach'),
    },
    {
      title: 'CTR moyen',
      value: formatPercent(totals.ctr),
      icon: <IconPercent />,
      colorClass: 'bg-teal-100 text-teal-600',
      delta: calcDelta('ctr'),
    },
    {
      title: 'CPM moyen',
      value: formatCurrency(totals.cpm),
      icon: <IconEye />,
      colorClass: 'bg-orange-100 text-orange-600',
      delta: calcDelta('cpm'),
      invertDelta: true,
    },
    {
      title: 'CPC moyen',
      value: formatCurrency(totals.cpc),
      icon: <IconCursor />,
      colorClass: 'bg-amber-100 text-amber-600',
      delta: calcDelta('cpc'),
      invertDelta: true,
    },
    {
      title: 'Conversions',
      value: formatNumber(totals.conversions),
      icon: <IconShoppingCart />,
      colorClass: 'bg-green-100 text-green-600',
      delta: calcDelta('conversions'),
    },
    {
      title: 'Fréquence',
      value: totals.frequency > 0 ? totals.frequency.toFixed(2) : '—',
      icon: <IconRepeat />,
      colorClass: 'bg-gray-100 text-gray-500',
      delta: calcDelta('frequency'),
    },
  ];

  const hasError = Object.keys(errors).length > 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow">
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Meta Ads Dashboard</h1>
              <p className="text-xs text-gray-400">
                {loading
                  ? 'Chargement…'
                  : lastUpdated
                  ? `Mis à jour le ${lastUpdated.toLocaleDateString('fr-FR')} à ${lastUpdated.toLocaleTimeString('fr-FR')}`
                  : 'Non chargé'}
              </p>
            </div>
          </div>

          {/* Date preset selector */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDatePreset(preset.value)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-all disabled:opacity-50 ${
                  datePreset === preset.value
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            <IconRefresh spin={loading} />
            {loading ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">

        {/* Budget pacing */}
        <BudgetPacing />

        {/* Error banners */}
        {hasError && (
          <div className="space-y-2">
            {errors.campaigns && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Erreur campagnes</p>
                  <p className="text-red-600 mt-0.5">{errors.campaigns}</p>
                </div>
              </div>
            )}
            {errors.adsets && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
                <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-semibold">Erreur ad sets</p>
                  <p className="text-red-600 mt-0.5">{errors.adsets}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-700">
              Aperçu — {PERIOD_LABELS[datePreset]}
            </h2>
            <div className="flex items-center gap-2">
              {comparison && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                  △ vs période précédente
                </span>
              )}
              <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-lg">
                {processedCampaigns.length} campagne{processedCampaigns.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Big 4 cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {bigCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={card.value}
                icon={card.icon}
                colorClass={card.colorClass}
                loading={loading}
                delta={card.delta}
                invertDelta={card.invertDelta}
                size="default"
              />
            ))}
          </div>

          {/* Small 7 cards */}
          <div className="grid grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {smallCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={card.value}
                icon={card.icon}
                colorClass={card.colorClass}
                loading={loading}
                delta={card.delta}
                invertDelta={card.invertDelta}
                size="small"
              />
            ))}
          </div>
        </section>

        {/* ── Funnel Diagnostic ── */}
        {!loading && (totals.impressions > 0 || totals.clicks > 0) && (
          <FunnelDiagnostic
            cpm={totals.cpm}
            ctr={totals.ctr}
            cvr={cvr}
            onKpiClick={(kpi) => setFocusedKpi(kpi)}
          />
        )}

        {/* ── Tables ── */}
        <section>
          {/* Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 mb-5">
            {(
              [
                { key: 'campaigns', label: 'Campagnes', count: activeCampaigns.length, hidden: hiddenCampaignsCount },
                { key: 'adsets',    label: 'Ad Sets',   count: activeAdsets.length,    hidden: hiddenAdsetsCount    },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                    activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {tab.count}
                </span>
                {tab.hidden > 0 && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-mono bg-gray-100 text-gray-400">
                    {tab.hidden} masquée{tab.hidden > 1 ? 's' : ''}
                  </span>
                )}
              </button>
            ))}
            {activeTab === 'campaigns' && !loading && (
              <span className="ml-auto text-[10px] text-gray-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Cliquez sur ▶ pour afficher les ad sets
              </span>
            )}
          </div>

          {/* Loading skeleton */}
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : activeTab === 'campaigns' ? (
            <DataTable
              data={activeCampaigns}
              columns={campaignColumns}
              emptyMessage="Aucune campagne active sur cette période."
              renderExpanded={renderExpanded}
            />
          ) : (
            <DataTable
              data={activeAdsets}
              columns={adsetColumns}
              emptyMessage="Aucun ad set actif sur cette période."
            />
          )}
        </section>

        {/* ── Daily chart ── */}
        <DailyChart
          refreshKey={refreshKey}
          datePreset={datePreset}
          focusedKpi={focusedKpi}
        />
      </main>

      {/* ── Footer ── */}
      <footer className="max-w-screen-2xl mx-auto px-6 py-6 mt-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">
          Données Meta Marketing API v18.0 · Compte{' '}
          <span className="font-mono">{process.env.NEXT_PUBLIC_ACCOUNT_HINT ?? 'act_308142134'}</span>
        </p>
      </footer>
    </div>
  );
}
