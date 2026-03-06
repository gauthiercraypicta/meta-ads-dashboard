'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  AreaChart, Area,
  BarChart, Bar,
  ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { GroupedCreative } from '@/types/creative';
import { formatCurrency } from '@/lib/formatters';
import type { CreativeHealthData } from '@/app/api/creative-health/route';

// ─── Colors ───────────────────────────────────────────────────────────────────

// Cohort palette — one color per launch month (warm → cool, oldest → newest)
const COHORT_COLORS = [
  '#fbbf24', // amber   – oldest
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
  '#6366f1', // indigo
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#84cc16', // lime
  '#22c55e', // green  – newest
];

// Chart 2 colors — hit=dark, other=light; video vs static
const C2 = {
  hitStatic:   '#1e3a8a',
  hitVideo:    '#2563eb',
  otherStatic: '#bfdbfe',
  otherVideo:  '#dbeafe',
};

// Chart 3 age-bucket palette — darkest = freshest
const AGE_COLORS: Record<string, string> = {
  '0-7j':    '#14532d',
  '8-14j':   '#15803d',
  '15-30j':  '#22c55e',
  '31-90j':  '#86efac',
  '91-180j': '#bbf7d0',
  '180j+':   '#dcfce7',
};
const AGE_BUCKETS = [
  { key: '0-7j',    min: 0,   max: 7,        label: '0–7 j'    },
  { key: '8-14j',   min: 8,   max: 14,       label: '8–14 j'   },
  { key: '15-30j',  min: 15,  max: 30,       label: '15–30 j'  },
  { key: '31-90j',  min: 31,  max: 90,       label: '31–90 j'  },
  { key: '91-180j', min: 91,  max: 180,      label: '91–180 j' },
  { key: '180j+',   min: 181, max: Infinity, label: '180j+'    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseLaunchMonth(launchDate: string): { sortKey: string; label: string } | null {
  // launchDate from API is "YYYY-MM-DD" (from naming convention) or "DD/MM/YYYY" from props
  let year: number, month: number;

  if (/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
    // From creative-health API: "YYYY-MM-DD"
    [year, month] = [parseInt(launchDate.slice(0, 4)), parseInt(launchDate.slice(5, 7))];
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(launchDate)) {
    // From GroupedCreative props: "DD/MM/YYYY"
    [year, month] = [parseInt(launchDate.slice(6)), parseInt(launchDate.slice(3, 5))];
  } else {
    return null;
  }
  if (!year || !month || isNaN(year) || isNaN(month)) return null;
  const d = new Date(year, month - 1, 1);
  return {
    sortKey: `${year}-${String(month).padStart(2, '0')}`,
    label:   d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
  };
}

function getLaunchWeekSortKey(launchDate: string): string | null {
  let dateObj: Date | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
    dateObj = new Date(launchDate + 'T00:00:00');
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(launchDate)) {
    const [dd, mm, yyyy] = launchDate.split('/');
    dateObj = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }
  if (!dateObj || isNaN(dateObj.getTime())) return null;
  // Get Monday of the week
  const day = dateObj.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  dateObj.setDate(dateObj.getDate() + diff);
  return dateObj.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function fmtWeekLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fmtCurrency(v: number): string {
  return v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v.toFixed(0)}`;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TItem { color?: string; name?: string; value?: number; unit?: string }
interface TProps { active?: boolean; payload?: TItem[]; label?: string | number }

function ChartTooltip({ active, payload, label, currency = false }: TProps & { currency?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs min-w-[150px]">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {[...payload].reverse().map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
          <span className="text-gray-500 flex-1">{p.name}</span>
          <span className="font-mono font-semibold text-gray-800">
            {currency ? fmtCurrency(p.value ?? 0) : (p.value ?? 0)}{p.unit ?? ''}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  creatives: GroupedCreative[]; // period-aggregate data (for Chart 2)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CreativeHealthPanel({ creatives }: Props) {
  const [open,       setOpen]       = useState(true);
  const [hitMarker,  setHitMarker]  = useState(2500);
  const [healthData, setHealthData] = useState<CreativeHealthData | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── Fetch time-series data ────────────────────────────────────────────────
  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/creative-health');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setHealthData(data as CreativeHealthData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  // ════════════════════════════════════════════════════════════════════════════
  // Chart 1 — Stacked Area: spend by launch cohort over time
  // ════════════════════════════════════════════════════════════════════════════
  const chart1 = useMemo(() => {
    if (!healthData?.items.length) return { rows: [], cohorts: [] };

    // Collect all unique weeks (sorted)
    const weekSet = new Set<string>();
    for (const item of healthData.items) {
      for (const w of item.weeklyData) weekSet.add(w.weekStart);
    }
    const allWeeks = [...weekSet].sort();

    // Collect all unique cohorts (launch month) — fall back to createdTime if no launchDate
    const cohortMap = new Map<string, string>(); // sortKey → label
    for (const item of healthData.items) {
      const key = item.launchDate || item.createdTime;
      const parsed = parseLaunchMonth(key);
      if (parsed) cohortMap.set(parsed.sortKey, parsed.label);
    }
    const sortedCohorts = [...cohortMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    // Assign a color per cohort (oldest = first color)
    const cohortColors = new Map<string, string>();
    sortedCohorts.forEach(([sortKey], i) =>
      cohortColors.set(sortKey, COHORT_COLORS[i % COHORT_COLORS.length]),
    );

    // Build row per week: { date, [cohortLabel]: spend, ... }
    const rows = allWeeks.map((weekStart) => {
      const row: Record<string, string | number> = { date: fmtWeekLabel(weekStart) };
      // init all cohorts to 0
      for (const [, label] of sortedCohorts) row[label] = 0;
      // accumulate
      for (const item of healthData.items) {
        const key    = item.launchDate || item.createdTime;
        const parsed = parseLaunchMonth(key);
        if (!parsed) continue;
        const spend = item.weeklyData.find((w) => w.weekStart === weekStart)?.spend ?? 0;
        if (!spend) continue;
        const label = cohortMap.get(parsed.sortKey);
        if (label) row[label] = (row[label] as number) + spend;
      }
      return row;
    });

    const cohorts = sortedCohorts.map(([sortKey, label]) => ({
      sortKey, label, color: cohortColors.get(sortKey)!,
    }));

    return { rows, cohorts };
  }, [healthData]);

  // ════════════════════════════════════════════════════════════════════════════
  // Chart 2 — Weekly production vs hit rate (from props)
  // ════════════════════════════════════════════════════════════════════════════
  const chart2 = useMemo(() => {
    if (!creatives.length) return { rows: [], totalAdded: 0 };

    const weekMap = new Map<string, {
      hitVideo: number; hitStatic: number;
      otherVideo: number; otherStatic: number;
    }>();

    for (const g of creatives) {
      const wk = getLaunchWeekSortKey(g.launchDate);
      if (!wk) continue;
      const prev = weekMap.get(wk) ?? { hitVideo: 0, hitStatic: 0, otherVideo: 0, otherStatic: 0 };
      const isHit   = g.spend >= hitMarker;
      const isVideo = g.format === 'VIDEO';
      if (isHit && isVideo)    prev.hitVideo++;
      else if (isHit)          prev.hitStatic++;
      else if (isVideo)        prev.otherVideo++;
      else                     prev.otherStatic++;
      weekMap.set(wk, prev);
    }

    let cumulative = 0;
    const rows = [...weekMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([wk, d]) => {
        const total = d.hitVideo + d.hitStatic + d.otherVideo + d.otherStatic;
        const hits  = d.hitVideo + d.hitStatic;
        cumulative += total;
        return {
          date:        fmtWeekLabel(wk),
          hitVideo:    d.hitVideo,
          hitStatic:   d.hitStatic,
          otherStatic: d.otherStatic,
          otherVideo:  d.otherVideo,
          total,
          hits,
          cumulative,
          hitRate:     total > 0 ? Math.round((hits / total) * 100) : 0,
        };
      });

    return { rows, totalAdded: cumulative };
  }, [creatives, hitMarker]);

  // ════════════════════════════════════════════════════════════════════════════
  // Chart 3 — Weekly spend by creative age at time of spending
  // ════════════════════════════════════════════════════════════════════════════
  const chart3 = useMemo(() => {
    if (!healthData?.items.length) return [];

    const weekSet = new Set<string>();
    for (const item of healthData.items) {
      for (const w of item.weeklyData) weekSet.add(w.weekStart);
    }
    const allWeeks = [...weekSet].sort();

    return allWeeks.map((weekStart) => {
      const weekDate = new Date(weekStart + 'T00:00:00');
      const row: Record<string, string | number> = { date: fmtWeekLabel(weekStart) };
      for (const b of AGE_BUCKETS) row[b.key] = 0;

      for (const item of healthData.items) {
        const created = new Date(item.createdTime + 'T00:00:00');
        const ageDays = Math.floor((weekDate.getTime() - created.getTime()) / 86_400_000);
        if (ageDays < 0) continue; // ad didn't exist yet this week
        const bucket = AGE_BUCKETS.find((b) => ageDays >= b.min && ageDays <= b.max);
        if (!bucket) continue;
        const spend = item.weeklyData.find((w) => w.weekStart === weekStart)?.spend ?? 0;
        if (spend) row[bucket.key] = (row[bucket.key] as number) + spend;
      }
      return row;
    });
  }, [healthData]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const undatedCount = useMemo(
    () => creatives.filter((g) => !parseLaunchMonth(g.launchDate)).length,
    [creatives],
  );

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">

      {/* ── Header ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-base">📊</div>
          <div className="text-left">
            <p className="text-sm font-semibold text-gray-900">Prédire le déclin créatif</p>
            <p className="text-xs text-gray-400">Churn des cohortes · Production vs hit rate · Dépendance aux anciennes créas</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!loading && open && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchHealth(); }}
              className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
            >
              ↺ Actualiser
            </button>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 pb-6 pt-5 space-y-8">

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center h-48 gap-3 text-gray-400">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Chargement des données weekly…</span>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {undatedCount > 0 && (
                <p className="text-[11px] text-gray-400 italic -mb-4">
                  ⚠ {undatedCount} créa{undatedCount > 1 ? 's' : ''} sans convention YYMMDD_ dans le nom — exclues du Chart 2.
                </p>
              )}

              {/* ── Chart 1: Spend by cohort (stacked area) ── */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-800">Chart 1 · Creative churn — spend par cohorte</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Chaque couleur = un mois de lancement. La hauteur totale = spend semaine.
                    Si les nouvelles cohortes ne grossissent pas, les anciennes churnent sans relève.
                  </p>
                </div>
                {chart1.rows.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-xs text-gray-400">
                    Aucune donnée time-series disponible.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <AreaChart data={chart1.rows} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10, fill: '#9ca3af' }} width={52} />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <ChartTooltip active={active} payload={payload as TItem[]} label={label} currency />
                        )}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(v) => <span style={{ color: '#374151' }}>{v}</span>}
                      />
                      {chart1.cohorts.map((c) => (
                        <Area
                          key={c.sortKey}
                          type="monotone"
                          dataKey={c.label}
                          stackId="1"
                          stroke={c.color}
                          fill={c.color}
                          fillOpacity={0.85}
                          strokeWidth={0}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Chart 2: Production vs hit rate (stacked bar + line) ── */}
              <div>
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Chart 2 · Production vs. hit rate</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Foncé = hits (spend ≥ hit marker) · Clair = production sans hit · Ligne = cumul total.
                      Cible hit rate : 10–15%.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 shrink-0">
                    <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">Hit marker $</span>
                    <input
                      type="number"
                      value={hitMarker}
                      onChange={(e) => setHitMarker(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-14 text-xs font-mono text-gray-800 bg-transparent border-none outline-none text-right"
                      step={500} min={0}
                    />
                  </div>
                </div>
                {chart2.rows.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-xs text-gray-400">
                    Aucune créa avec date de lancement détectée.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chart2.rows} margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left"  allowDecimals={false} tick={{ fontSize: 10, fill: '#9ca3af' }} width={36} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#9ca3af' }} width={32} />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <ChartTooltip active={active} payload={payload as TItem[]} label={label} />
                        )}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar yAxisId="left" dataKey="hitVideo"    stackId="a" name="Hit Video"    fill={C2.hitVideo}    />
                      <Bar yAxisId="left" dataKey="hitStatic"   stackId="a" name="Hit Static"   fill={C2.hitStatic}   />
                      <Bar yAxisId="left" dataKey="otherVideo"  stackId="a" name="Other Video"  fill={C2.otherVideo}  />
                      <Bar yAxisId="left" dataKey="otherStatic" stackId="a" name="Other Static" fill={C2.otherStatic} radius={[2, 2, 0, 0]} />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="cumulative"
                        name="Cumul total"
                        stroke="#111827"
                        strokeWidth={2}
                        dot={false}
                      />
                      <ReferenceLine yAxisId="left" y={0} stroke="#e5e7eb" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Chart 3: Spend by creative age (stacked bar) ── */}
              <div>
                <div className="mb-3">
                  <p className="text-sm font-semibold text-gray-800">Chart 3 · Dépendance aux anciennes créas</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Spend hebdo ventilé par ancienneté de la créa <em>au moment du spend</em>.
                    Plus foncé = plus récent. Si le foncé disparaît, les nouvelles créas ne performent pas.
                  </p>
                </div>
                {chart3.length === 0 ? (
                  <div className="h-48 flex items-center justify-center text-xs text-gray-400">
                    Aucune donnée time-series disponible.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chart3} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barSize={14}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" />
                      <YAxis tickFormatter={fmtCurrency} tick={{ fontSize: 10, fill: '#9ca3af' }} width={52} />
                      <Tooltip
                        content={({ active, payload, label }) => (
                          <ChartTooltip active={active} payload={payload as TItem[]} label={label} currency />
                        )}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        formatter={(v) => <span style={{ color: '#374151' }}>{v}</span>}
                      />
                      {AGE_BUCKETS.map((b) => (
                        <Bar
                          key={b.key}
                          dataKey={b.key}
                          stackId="a"
                          name={b.label}
                          fill={AGE_COLORS[b.key]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ── Warning ── */}
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-800 mb-2.5">⚠️ Warning</p>
                <ul className="space-y-2">
                  {[
                    'Ne regardez pas les métriques CPA, CPM ou ROAS du compte — elles ont un lag de plusieurs semaines.',
                    'Si vous ne surveillez que votre P&L, le problème mettra 3 à 4 mois à apparaître financièrement.',
                    'Quand ces chiffres chutent, il est déjà trop tard — votre compte est déjà en danger.',
                  ].map((w, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-amber-700">
                      <span className="shrink-0 mt-px text-amber-400">→</span>{w}
                    </li>
                  ))}
                </ul>
              </div>

              {/* ── Benchmarks ── */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-xs font-bold text-emerald-800 mb-3">📌 Benchmarks</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  {[
                    { stat: '2–3 mois', desc: "Durée de vie moyenne d'une créa avant churn" },
                    { stat: '10–15%',   desc: 'Taux de hit cible sur la production mensuelle' },
                    { stat: '1–2 mois', desc: 'Avance sur la baisse de performance réelle' },
                  ].map(({ stat, desc }) => (
                    <div key={stat} className="flex items-start gap-2.5">
                      <span className="font-bold text-emerald-700 text-sm shrink-0">{stat}</span>
                      <span className="text-xs text-emerald-600 leading-relaxed">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-emerald-200 pt-3 space-y-1.5">
                  {[
                    'Créer de nouveaux ads avant que les anciens churnent',
                    "S'assurer que le taux de hit des nouvelles créas est de 10–15%",
                    'Augmenter la part du spend provenant des nouvelles créas',
                  ].map((s, i) => (
                    <p key={i} className="flex items-start gap-2 text-xs text-emerald-700">
                      <span className="text-emerald-500 shrink-0">✓</span>{s}
                    </p>
                  ))}
                  <p className="text-[11px] text-emerald-600 italic pt-2 border-t border-emerald-200 mt-2">
                    Si on voit quelque chose chuter aujourd'hui → production créative d'urgence immédiate, avant que ça touche le CPA.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
