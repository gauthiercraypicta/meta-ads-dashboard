'use client';

import React, { useState, useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyPerf {
  date: string;   // 'YYYY-MM-DD'
  spend: number;
  revenue: number;
  roas: number;
}

interface Props {
  dailyData: DailyPerf[];
  monthlyBudget: number;
  margin?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function fmtMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000)     return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TTProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; color: string; name: string }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: TTProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-gray-700">{label}</p>
      {payload.map((p) => (
        p.value != null && (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-gray-600">{p.name}:</span>
            <span className="font-mono text-gray-900">
              {p.dataKey === 'spend' ? fmtMoney(p.value) : `${p.value.toFixed(2)}x`}
            </span>
          </div>
        )
      ))}
    </div>
  );
}

// ─── Scenario card ────────────────────────────────────────────────────────────

interface ScenarioCardProps {
  label: string;
  emoji: string;
  color: string;
  revenue: number;
  spend: number;
  margin: number;
  roasLabel: string;
}

function ScenarioCard({ label, emoji, color, revenue, spend, margin, roasLabel }: ScenarioCardProps) {
  const roi = spend > 0 ? ((revenue * margin - spend) / spend) * 100 : 0;
  return (
    <div className="flex-1 rounded-lg border p-3 text-center" style={{ borderColor: color + '50', background: color + '08' }}>
      <p className="text-sm mb-0.5">{emoji}</p>
      <p className="text-[11px] font-semibold" style={{ color }}>{label}</p>
      <p className="text-xs text-gray-400 mb-1">{roasLabel}</p>
      <p className="text-base font-bold text-gray-900 font-mono">{fmtMoney(revenue)}</p>
      <p className={`text-xs font-mono mt-0.5 ${roi >= 0 ? 'text-green-600' : 'text-red-500'}`}>
        ROI {roi >= 0 ? '+' : ''}{roi.toFixed(0)}%
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BudgetProjectionScenarios({
  dailyData,
  monthlyBudget,
  margin = 0.45,
}: Props) {
  const [targetRoas, setTargetRoas] = useState<number>(0); // 0 = use current ROAS

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // Sort real data
  const sorted = useMemo(
    () => [...dailyData].sort((a, b) => a.date.localeCompare(b.date)),
    [dailyData],
  );

  const todayObj = new Date(today + 'T00:00:00');
  const year     = todayObj.getFullYear();
  const month    = todayObj.getMonth();
  const totalDays = daysInMonth(year, month);
  const dayOfMonth = todayObj.getDate();
  const remaining  = totalDays - dayOfMonth;

  // Last 7 days average spend
  const last7 = sorted.slice(-7);
  const avgSpend = last7.length ? last7.reduce((s, d) => s + d.spend, 0) / last7.length : 0;

  // Current ROAS (last 7d)
  const totalSpend7   = last7.reduce((s, d) => s + d.spend, 0);
  const totalRevenue7 = last7.reduce((s, d) => s + d.revenue, 0);
  const currentRoas   = totalSpend7 > 0 ? totalRevenue7 / totalSpend7 : 0;

  const effectiveRoas = targetRoas > 0 ? targetRoas : currentRoas;

  // Total real spend so far
  const realSpend   = sorted.reduce((s, d) => s + d.spend, 0);
  const realRevenue = sorted.reduce((s, d) => s + d.revenue, 0);

  // Projections
  const projSpend        = remaining * avgSpend;
  const totalProjected   = realSpend + projSpend;

  function scenarioRevenue(roasMult: number): number {
    return realRevenue + projSpend * (effectiveRoas * roasMult);
  }

  const scenarios = {
    pessimiste: scenarioRevenue(0.75),
    realiste:   scenarioRevenue(1.0),
    optimiste:  scenarioRevenue(1.15),
  };

  // Build chart rows: real days + projected days
  const allDays: string[] = [];
  for (let d = 1; d <= totalDays; d++) {
    allDays.push(
      `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
  }

  const chartData = allDays.map((date) => {
    const real = sorted.find((d) => d.date === date);
    const isProjection = date > today;
    const row: Record<string, string | number | null> = {
      date: fmtDate(date),
      fullDate: date,
    };
    if (real) {
      row.spend = real.spend;
      row.roas  = real.roas;
    }
    if (isProjection) {
      row.projSpend  = avgSpend;
      row.roasPess   = effectiveRoas * 0.75;
      row.roasReal   = effectiveRoas;
      row.roasOpt    = effectiveRoas * 1.15;
    }
    return row;
  });

  const todayLabel = fmtDate(today);

  if (!dailyData.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée disponible
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Projection Budget — Scénarios What-if</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            ROAS actuel {currentRoas.toFixed(2)}x · Dépense moy. 7j {fmtMoney(avgSpend)}/j · {remaining} jours restants
          </p>
        </div>
        {monthlyBudget > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Budget mensuel</p>
            <p className="text-sm font-bold text-gray-700 font-mono">{fmtMoney(monthlyBudget)}</p>
            <p className={`text-[10px] font-mono ${totalProjected <= monthlyBudget ? 'text-green-600' : 'text-orange-500'}`}>
              Proj: {fmtMoney(totalProjected)}
            </p>
          </div>
        )}
      </div>

      {/* Slider */}
      <div className="mb-4 bg-gray-50 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-medium text-gray-600">
            ROAS cible (projection réaliste)
          </label>
          <span className="text-xs font-bold font-mono text-blue-700">
            {targetRoas > 0 ? `${targetRoas.toFixed(1)}x` : `Auto (${currentRoas.toFixed(2)}x)`}
          </span>
        </div>
        <input
          type="range"
          min={1.0}
          max={5.0}
          step={0.1}
          value={targetRoas > 0 ? targetRoas : currentRoas}
          onChange={(e) => setTargetRoas(parseFloat(e.target.value))}
          className="w-full accent-blue-600"
        />
        <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
          <span>1.0x</span><span>2.0x</span><span>3.0x</span><span>4.0x</span><span>5.0x</span>
        </div>
        {targetRoas > 0 && (
          <button
            onClick={() => setTargetRoas(0)}
            className="mt-1 text-[10px] text-blue-500 hover:underline"
          >
            Réinitialiser (ROAS actuel)
          </button>
        )}
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            interval={Math.floor(totalDays / 8)}
          />
          {/* Left Y axis: spend */}
          <YAxis
            yAxisId="spend"
            orientation="left"
            tickFormatter={(v) => fmtMoney(v)}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={52}
          />
          {/* Right Y axis: ROAS */}
          <YAxis
            yAxisId="roas"
            orientation="right"
            tickFormatter={(v) => `${v.toFixed(1)}x`}
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            width={36}
            domain={[0, 'auto']}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Today reference line */}
          <ReferenceLine
            yAxisId="spend"
            x={todayLabel}
            stroke="#6b7280"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            label={{ value: "Aujourd'hui", position: 'top', fill: '#6b7280', fontSize: 9 }}
          />

          {/* Monthly budget line */}
          {monthlyBudget > 0 && (
            <ReferenceLine
              yAxisId="spend"
              y={monthlyBudget / totalDays}
              stroke="#e879f9"
              strokeDasharray="5 3"
              label={{ value: 'Budget/j', position: 'insideTopRight', fill: '#a21caf', fontSize: 9 }}
            />
          )}

          {/* Real spend bars */}
          <Bar yAxisId="spend" dataKey="spend" name="Dépenses réelles" fill="#3b82f6" fillOpacity={0.7} radius={[2, 2, 0, 0]} barSize={8} />
          {/* Projected spend bars */}
          <Bar yAxisId="spend" dataKey="projSpend" name="Dépenses proj." fill="#93c5fd" fillOpacity={0.5} radius={[2, 2, 0, 0]} barSize={8} />

          {/* Real ROAS line */}
          <Line yAxisId="roas" type="monotone" dataKey="roas" name="ROAS réel" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls={false} />
          {/* Projection lines */}
          <Line yAxisId="roas" type="monotone" dataKey="roasPess" name="Pessimiste" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />
          <Line yAxisId="roas" type="monotone" dataKey="roasReal" name="Réaliste" stroke="#f97316" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
          <Line yAxisId="roas" type="monotone" dataKey="roasOpt"  name="Optimiste" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />

          <Legend
            wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
            iconType="line"
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Scenario cards */}
      <div className="flex gap-3 mt-4">
        <ScenarioCard
          label="Pessimiste"
          emoji="📉"
          color="#ef4444"
          revenue={scenarios.pessimiste}
          spend={totalProjected}
          margin={margin}
          roasLabel={`ROAS ${(effectiveRoas * 0.75).toFixed(2)}x`}
        />
        <ScenarioCard
          label="Réaliste"
          emoji="📊"
          color="#f97316"
          revenue={scenarios.realiste}
          spend={totalProjected}
          margin={margin}
          roasLabel={`ROAS ${effectiveRoas.toFixed(2)}x`}
        />
        <ScenarioCard
          label="Optimiste"
          emoji="🚀"
          color="#22c55e"
          revenue={scenarios.optimiste}
          spend={totalProjected}
          margin={margin}
          roasLabel={`ROAS ${(effectiveRoas * 1.15).toFixed(2)}x`}
        />
      </div>
    </div>
  );
}
