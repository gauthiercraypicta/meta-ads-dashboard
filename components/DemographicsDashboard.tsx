'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import type { DemographicsResponse, DemoRow } from '@/types/demographics';

// ─── Constants ────────────────────────────────────────────────────────────────

const AGE_ORDER  = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const GENDER_CFG = {
  Homme: { color: '#3b82f6', light: '#dbeafe' },
  Femme: { color: '#ec4899', light: '#fce7f3' },
  Autre: { color: '#9ca3af', light: '#f3f4f6' },
};
const PRODUCT_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt$   = (v: number) => v === 0 ? '—' : `$${v.toFixed(v < 10 ? 2 : 0)}`;
const fmtN   = (v: number) => v === 0 ? '—' : v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
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

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900 font-mono">{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// Multi-select campaign filter with pills
function CampaignFilter({
  campaigns, selected, onToggle, onReset,
}: {
  campaigns: string[];
  selected: Set<string>;
  onToggle: (c: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={onReset}
        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
          selected.size === 0
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
        }`}>
        Toutes
      </button>
      {campaigns.map((c) => {
        const isOn = selected.has(c);
        const short = c.replace(/^Picta_?/i, '').slice(0, 28);
        return (
          <button key={c} onClick={() => onToggle(c)} title={c}
            className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition-all ${
              isOn
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
            }`}>
            {short}{c.length > 28 ? '…' : ''}
          </button>
        );
      })}
    </div>
  );
}

// Product filter pills
function ProductFilter({
  products, selected, onToggle, onReset,
}: {
  products: string[];
  selected: Set<string>;
  onToggle: (p: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Produit</span>
      <button onClick={onReset}
        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
          selected.size === 0
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
        }`}>
        Tous
      </button>
      {products.map((p, i) => {
        const isOn = selected.has(p);
        const color = PRODUCT_COLORS[i % PRODUCT_COLORS.length];
        return (
          <button key={p} onClick={() => onToggle(p)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border-2 transition-all ${
              isOn ? 'text-white' : 'bg-white'
            }`}
            style={isOn
              ? { backgroundColor: color, borderColor: color }
              : { borderColor: color, color }}>
            {p}
          </button>
        );
      })}
    </div>
  );
}

// Custom tooltip for age/gender bar chart
function AgeTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: readonly { name: string; value: number; fill: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 text-xs pointer-events-none">
      <p className="font-semibold text-gray-900 mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex justify-between gap-6 mb-0.5">
          <span style={{ color: p.fill }}>{p.name}</span>
          <span className="font-mono font-semibold">{fmt$(p.value)}</span>
        </p>
      ))}
      <p className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between gap-6 font-semibold text-gray-700">
        <span>Total</span><span className="font-mono">{fmt$(total)}</span>
      </p>
    </div>
  );
}

// Horizontal heatmap cell for the cross-table
function HeatCell({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? value / max : 0;
  return (
    <td className="px-2 py-1.5 text-right text-xs font-mono whitespace-nowrap"
      style={{ backgroundColor: `rgba(59,130,246,${(pct * 0.6).toFixed(2)})`, color: pct > 0.5 ? '#fff' : '#374151' }}>
      {value > 0 ? fmt$(value) : '—'}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DemographicsDashboard() {
  const [data,    setData]    = useState<DemographicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Filters
  const [selCampaigns, setSelCampaigns] = useState<Set<string>>(new Set());
  const [selProducts,  setSelProducts]  = useState<Set<string>>(new Set());
  const [selPlatforms, setSelPlatforms] = useState<Set<string>>(new Set());

  // View for cross-table: by campaign or by product
  const [crossView, setCrossView] = useState<'campaign' | 'product'>('campaign');

  useEffect(() => {
    fetch('/api/demographics')
      .then((r) => r.json())
      .then((json: DemographicsResponse & { error?: string }) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const rows = useMemo<DemoRow[]>(() => {
    if (!data) return [];
    return data.rows.filter((r) => {
      if (selCampaigns.size > 0 && !selCampaigns.has(r.campaignName)) return false;
      if (selProducts.size  > 0 && !selProducts.has(r.product))        return false;
      if (selPlatforms.size > 0 && !selPlatforms.has(r.platform))      return false;
      return true;
    });
  }, [data, selCampaigns, selProducts, selPlatforms]);

  // ── Age × gender spend breakdown ───────────────────────────────────────────

  const ageSpendData = useMemo(() => {
    const map = new Map<string, { age: string; Homme: number; Femme: number; Autre: number }>();
    for (const r of rows) {
      const e = map.get(r.age) ?? { age: r.age, Homme: 0, Femme: 0, Autre: 0 };
      if      (r.gender === 'Homme') e.Homme += r.spend;
      else if (r.gender === 'Femme') e.Femme += r.spend;
      else                           e.Autre += r.spend;
      map.set(r.age, e);
    }
    return AGE_ORDER.filter((a) => map.has(a)).map((a) => map.get(a)!);
  }, [rows]);

  // ── Age × gender install breakdown ────────────────────────────────────────

  const ageInstallData = useMemo(() => {
    const map = new Map<string, { age: string; Homme: number; Femme: number; Autre: number }>();
    for (const r of rows) {
      if (!r.installs) continue;
      const e = map.get(r.age) ?? { age: r.age, Homme: 0, Femme: 0, Autre: 0 };
      if      (r.gender === 'Homme') e.Homme += r.installs;
      else if (r.gender === 'Femme') e.Femme += r.installs;
      else                           e.Autre += r.installs;
      map.set(r.age, e);
    }
    return AGE_ORDER.filter((a) => map.has(a)).map((a) => map.get(a)!);
  }, [rows]);

  // ── CPI by age ─────────────────────────────────────────────────────────────

  const ageCpiData = useMemo(() => {
    const spendMap    = new Map<string, number>();
    const installMap  = new Map<string, number>();
    for (const r of rows) {
      spendMap.set(r.age,   (spendMap.get(r.age)   ?? 0) + r.spend);
      installMap.set(r.age, (installMap.get(r.age)  ?? 0) + r.installs);
    }
    return AGE_ORDER
      .filter((a) => spendMap.has(a))
      .map((a) => ({
        age: a,
        cpi: (installMap.get(a) ?? 0) > 0 ? (spendMap.get(a)! / installMap.get(a)!) : 0,
      }))
      .filter((d) => d.cpi > 0);
  }, [rows]);

  // ── Gender totals ─────────────────────────────────────────────────────────

  const genderTotals = useMemo(() => {
    const t: Record<string, { spend: number; installs: number }> = {
      Homme: { spend: 0, installs: 0 },
      Femme: { spend: 0, installs: 0 },
      Autre: { spend: 0, installs: 0 },
    };
    for (const r of rows) {
      if (r.gender in t) {
        t[r.gender].spend    += r.spend;
        t[r.gender].installs += r.installs;
      }
    }
    return t;
  }, [rows]);

  // ── Summary totals ────────────────────────────────────────────────────────

  const totals = useMemo(() => {
    const spend       = rows.reduce((s, r) => s + r.spend, 0);
    const installs    = rows.reduce((s, r) => s + r.installs, 0);
    const impressions = rows.reduce((s, r) => s + r.impressions, 0);
    const clicks      = rows.reduce((s, r) => s + r.clicks, 0);
    return { spend, installs, impressions, clicks, cpi: installs > 0 ? spend / installs : 0 };
  }, [rows]);

  // ── Top age (by spend) ────────────────────────────────────────────────────

  const topAge = useMemo(() => {
    if (!ageSpendData.length) return null;
    return ageSpendData.reduce((best, cur) => {
      const t = cur.Homme + cur.Femme + cur.Autre;
      const b = best.Homme + best.Femme + best.Autre;
      return t > b ? cur : best;
    });
  }, [ageSpendData]);

  // ── Cross-table data ──────────────────────────────────────────────────────

  const crossTable = useMemo(() => {
    if (!data) return { cols: [], ageGroups: [], cells: {} as Record<string, Record<string, number>>, max: 0 };
    const allCols = crossView === 'campaign' ? data.campaigns : data.products;
    const activeCols = crossView === 'campaign'
      ? (selCampaigns.size > 0 ? allCols.filter((c) => selCampaigns.has(c)) : allCols)
      : (selProducts.size  > 0 ? allCols.filter((p) => selProducts.has(p))  : allCols);
    const cols = activeCols.slice(0, 12);

    const cells: Record<string, Record<string, number>> = {};
    let max = 0;
    for (const r of rows) {
      const col = crossView === 'campaign' ? r.campaignName : r.product;
      if (!cols.includes(col)) continue;
      if (!cells[r.age]) cells[r.age] = {};
      cells[r.age][col] = (cells[r.age][col] ?? 0) + r.spend;
      if (cells[r.age][col] > max) max = cells[r.age][col];
    }
    const ageGroups = AGE_ORDER.filter((a) => cells[a]);
    return { cols, ageGroups, cells, max };
  }, [data, rows, crossView, selCampaigns, selProducts]);

  // ── Detailed sortable table ───────────────────────────────────────────────

  const [sortKey, setSortKey] = useState<keyof DemoRow>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const va = a[sortKey] as number | string;
      const vb = b[sortKey] as number | string;
      const diff = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb));
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [rows, sortKey, sortDir]);

  const handleSort = (k: keyof DemoRow) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(k); setSortDir('desc'); }
  };

  const toggleCamp     = (c: string) => setSelCampaigns((s)  => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const toggleProduct  = (p: string) => setSelProducts((s)   => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });
  const togglePlatform = (p: string) => setSelPlatforms((s)  => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; });

  // ── Loading / error ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
        <svg className="w-7 h-7 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm">Chargement des données démographiques…</p>
      </div>
    );
  }

  const hasInstalls = totals.installs > 0;
  const totalSpend  = genderTotals.Homme.spend + genderTotals.Femme.spend + genderTotals.Autre.spend;

  return (
    <div className="space-y-6">

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
          <span className="mt-0.5 shrink-0">⚠️</span>
          <div>
            <p className="font-semibold">Erreur lors du chargement des données Meta</p>
            <p className="text-red-700 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Header info */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400">
            Données Meta · Campagnes actives depuis le <strong>1er juillet 2026</strong>
            {data && <span className="ml-2 text-gray-300">· {data.rows.length} lignes brutes</span>}
          </p>
        </div>
      </div>

      {/* Filter bar */}
      {data && (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 space-y-3">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Campagnes</p>
            <CampaignFilter
              campaigns={data.campaigns}
              selected={selCampaigns}
              onToggle={toggleCamp}
              onReset={() => setSelCampaigns(new Set())}
            />
          </div>
          {data.products.length > 1 && (
            <div className="pt-2 border-t border-gray-100">
              <ProductFilter
                products={data.products}
                selected={selProducts}
                onToggle={toggleProduct}
                onReset={() => setSelProducts(new Set())}
              />
            </div>
          )}
          {data.platforms && data.platforms.length > 1 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Plateforme</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelPlatforms(new Set())}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selPlatforms.size === 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}
                >
                  Toutes
                </button>
                {data.platforms.map((p) => (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${selPlatforms.has(p) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile label="Dépenses totales"  value={fmt$(totals.spend)}        sub={`depuis 1er juil. 2026`} />
        <KpiTile label="Installs"          value={fmtN(totals.installs)}     sub={hasInstalls ? `CPI moy. ${fmt$(totals.cpi)}` : undefined} />
        <KpiTile label="Impressions"       value={fmtN(totals.impressions)}  />
        <KpiTile label="Tranche phare"     value={topAge?.age ?? '—'}         sub={topAge ? fmt$(topAge.Homme + topAge.Femme + topAge.Autre) + ' dépensés' : undefined} />
        <KpiTile label="Part hommes"       value={totalSpend > 0 ? fmtPct(genderTotals.Homme.spend / totalSpend) : '—'}
                 sub={fmt$(genderTotals.Homme.spend)} />
        <KpiTile label="Part femmes"       value={totalSpend > 0 ? fmtPct(genderTotals.Femme.spend / totalSpend) : '—'}
                 sub={fmt$(genderTotals.Femme.spend)} />
      </div>

      {/* Age × Gender charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Spend by age + gender */}
        <Card title="Dépenses par tranche d'âge" subtitle="Répartition Homme / Femme">
          {ageSpendData.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">Aucune donnée disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={ageSpendData} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `$${Math.round(v as number)}`}
                  tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="age" width={42}
                  tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<AgeTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Homme" stackId="a" fill={GENDER_CFG.Homme.color} name="Homme" />
                <Bar dataKey="Femme" stackId="a" fill={GENDER_CFG.Femme.color} name="Femme" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Installs by age + gender */}
        {hasInstalls ? (
          <Card title="Installs par tranche d'âge" subtitle="Répartition Homme / Femme">
            {ageInstallData.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucune donnée d'install disponible.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ageInstallData} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="age" width={42}
                    tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Homme" stackId="a" fill={GENDER_CFG.Homme.color} name="Homme" />
                  <Bar dataKey="Femme" stackId="a" fill={GENDER_CFG.Femme.color} name="Femme" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        ) : (
          /* CPI by age if no install data */
          <Card title="CPI par tranche d'âge" subtitle="Coût moyen par install">
            {ageCpiData.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Aucun CPI calculable.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ageCpiData} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(1)}`}
                    tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="age" width={42}
                    tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: unknown) => [fmt$(Number(v)), 'CPI']} />
                  <Bar dataKey="cpi" name="CPI" fill="#10b981" radius={[0, 4, 4, 0]}>
                    {ageCpiData.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? '#10b981' : '#34d399'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        )}
      </div>

      {/* CPI by age (always show if we have installs) */}
      {hasInstalls && ageCpiData.length > 0 && (
        <Card title="CPI par tranche d'âge" subtitle="Coût par install — identifier les audiences les plus rentables">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={ageCpiData} layout="vertical" margin={{ top: 4, right: 80, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
              <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(1)}`}
                tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="age" width={42}
                tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: unknown) => [fmt$(Number(v)), 'CPI']} />
              <Bar dataKey="cpi" name="CPI" radius={[0, 4, 4, 0]}>
                {ageCpiData.map((_, i) => <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Cross-table: age × campaign/product */}
      <Card
        title="Tableau croisé · Dépenses par âge"
        subtitle="Couleur proportionnelle aux dépenses — plus foncé = plus dépensé">
        <div className="flex gap-1 mb-4">
          {(['campaign', 'product'] as const).map((v) => (
            <button key={v} onClick={() => setCrossView(v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                crossView === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {v === 'campaign' ? 'Par campagne' : 'Par produit'}
            </button>
          ))}
        </div>
        {crossTable.cols.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Aucune donnée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Âge</th>
                  {crossTable.cols.map((col) => (
                    <th key={col} className="px-2 py-2 text-right font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap max-w-[120px] truncate"
                      title={col}>
                      {col.replace(/^Picta_?/i, '').slice(0, 18)}{col.length > 18 ? '…' : ''}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold text-gray-700 uppercase tracking-wide">Total</th>
                </tr>
              </thead>
              <tbody>
                {crossTable.ageGroups.map((age) => {
                  const rowTotal = crossTable.cols.reduce((s, c) => s + (crossTable.cells[age]?.[c] ?? 0), 0);
                  return (
                    <tr key={age} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 font-semibold text-gray-700 whitespace-nowrap">{age}</td>
                      {crossTable.cols.map((col) => (
                        <HeatCell key={col} value={crossTable.cells[age]?.[col] ?? 0} max={crossTable.max} />
                      ))}
                      <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-800 whitespace-nowrap border-l border-gray-100">
                        {fmt$(rowTotal)}
                      </td>
                    </tr>
                  );
                })}
                {/* Col totals */}
                <tr className="border-t border-gray-200 bg-gray-50/50">
                  <td className="px-3 py-1.5 font-semibold text-gray-500 text-[11px] uppercase">Total</td>
                  {crossTable.cols.map((col) => {
                    const colTotal = crossTable.ageGroups.reduce((s, a) => s + (crossTable.cells[a]?.[col] ?? 0), 0);
                    return (
                      <td key={col} className="px-2 py-1.5 text-right text-xs font-mono font-semibold text-gray-700 whitespace-nowrap">
                        {fmt$(colTotal)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-right font-mono font-bold text-gray-900 whitespace-nowrap border-l border-gray-100">
                    {fmt$(totals.spend)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detailed table */}
      <Card title="Données détaillées" subtitle="Toutes les combinaisons âge × genre × campagne — cliquer pour trier">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-100">
                {([
                  { k: 'campaignName', label: 'Campagne' },
                  { k: 'product',      label: 'Produit' },
                  { k: 'age',          label: 'Âge' },
                  { k: 'gender',       label: 'Genre' },
                  { k: 'spend',        label: 'Dépenses' },
                  { k: 'impressions',  label: 'Impressions' },
                  { k: 'clicks',       label: 'Clics' },
                  { k: 'installs',     label: 'Installs' },
                  { k: 'cpi',          label: 'CPI' },
                  { k: 'cpm',          label: 'CPM' },
                  { k: 'ctr',          label: 'CTR' },
                ] as { k: keyof DemoRow; label: string }[]).map((col) => (
                  <th key={col.k} onClick={() => handleSort(col.k)}
                    className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap cursor-pointer hover:text-gray-700 select-none">
                    {col.label}
                    {sortKey === col.k && <span className="ml-1 text-blue-500">{sortDir === 'desc' ? '↓' : '↑'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.slice(0, 200).map((r, i) => (
                <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50/30'}`}>
                  <td className="px-3 py-2 max-w-[200px] truncate font-medium text-gray-800" title={r.campaignName}>
                    {r.campaignName.replace(/^Picta_?/i, '').slice(0, 30)}{r.campaignName.length > 35 ? '…' : ''}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.product}</td>
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{r.age}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: GENDER_CFG[r.gender as keyof typeof GENDER_CFG]?.color ?? '#9ca3af' }} />
                      <span className="text-gray-700">{r.gender}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{fmt$(r.spend)}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{fmtN(r.impressions)}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{fmtN(r.clicks)}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{fmtN(r.installs)}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{r.cpi > 0 ? fmt$(r.cpi) : '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{r.cpm > 0 ? fmt$(r.cpm) : '—'}</td>
                  <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{r.ctr > 0 ? fmtPct(r.ctr) : '—'}</td>
                </tr>
              ))}
              {sortedRows.length > 200 && (
                <tr>
                  <td colSpan={11} className="px-3 py-3 text-center text-xs text-gray-400">
                    {sortedRows.length - 200} lignes supplémentaires — affinez les filtres
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}
