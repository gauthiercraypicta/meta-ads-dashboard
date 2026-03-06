'use client';

import React, { useState, useMemo } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Lun, 6=Dim
  hour: number;                      // 0–23
  roas: number;
  spend: number;
  conversions: number;
  ctr?: number;
}

type Metric = 'roas' | 'cpa' | 'ctr';

interface Props {
  data: HeatmapCell[];
  metric?: Metric;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS  = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS       = Array.from({ length: 24 }, (_, i) => i);
const SHOW_HOURS  = new Set([0, 3, 6, 9, 12, 15, 18, 21]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMetricValue(cell: HeatmapCell, metric: Metric): number {
  if (metric === 'roas') return cell.roas;
  if (metric === 'ctr')  return cell.ctr ?? 0;
  // cpa: spend / conversions (lower = better)
  return cell.conversions > 0 ? cell.spend / cell.conversions : 0;
}

function percentileColor(val: number, p33: number, p66: number, isInverted: boolean): string {
  // CPA is inverted (lower is better)
  if (val === 0) return '#f3f4f6'; // gray-100 — no data
  let t: number;
  if (isInverted) {
    // high val → red, low val → green
    if (val <= p33) t = 1;
    else if (val <= p66) t = 0.5;
    else t = 0;
  } else {
    // high val → green
    if (val >= p66) t = 1;
    else if (val >= p33) t = 0.5;
    else t = 0;
  }

  if (t >= 0.75) return '#22c55e'; // green-500
  if (t >= 0.5)  return '#86efac'; // green-300
  if (t >= 0.25) return '#fde68a'; // amber-200
  return '#fca5a5';                // red-300
}

function formatVal(val: number, metric: Metric): string {
  if (val === 0) return '—';
  if (metric === 'roas') return `${val.toFixed(1)}x`;
  if (metric === 'ctr')  return `${(val * 100).toFixed(2)}%`;
  return `$${val.toFixed(0)}`; // CPA
}

function formatSpend(v: number): string {
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  cell: HeatmapCell | null;
  metric: Metric;
}

function HoverTooltip({ state }: { state: TooltipState }) {
  if (!state.visible || !state.cell) return null;
  const { cell, metric } = state;
  const cpa = cell.conversions > 0 ? cell.spend / cell.conversions : null;
  return (
    <div
      className="fixed z-50 bg-gray-900 text-white text-xs rounded-lg p-3 pointer-events-none shadow-xl"
      style={{ left: state.x + 12, top: state.y - 10 }}
    >
      <p className="font-semibold mb-1">
        {DAY_LABELS[cell.day]} {cell.hour}h–{cell.hour + 1}h
      </p>
      <div className="space-y-0.5 text-gray-300">
        <p>ROAS : <span className="text-white font-mono">{cell.roas > 0 ? `${cell.roas.toFixed(2)}x` : '—'}</span></p>
        <p>Dépenses : <span className="text-white font-mono">{formatSpend(cell.spend)}</span></p>
        <p>Conv. : <span className="text-white font-mono">{cell.conversions}</span></p>
        {cell.ctr != null && <p>CTR : <span className="text-white font-mono">{(cell.ctr * 100).toFixed(2)}%</span></p>}
        {cpa != null && <p>CPA : <span className="text-white font-mono">${cpa.toFixed(2)}</span></p>}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HeatmapHourDay({ data, metric: defaultMetric = 'roas' }: Props) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, cell: null, metric: 'roas',
  });

  // Build lookup map: day × hour → cell
  const cellMap = useMemo(() => {
    const map = new Map<string, HeatmapCell>();
    for (const c of data) map.set(`${c.day}-${c.hour}`, c);
    return map;
  }, [data]);

  // Compute percentiles for the active metric
  const { p33, p66 } = useMemo(() => {
    const vals = data.map((c) => getMetricValue(c, metric)).filter((v) => v > 0).sort((a, b) => a - b);
    if (!vals.length) return { p33: 0, p66: 0 };
    return {
      p33: vals[Math.floor(vals.length * 0.33)],
      p66: vals[Math.floor(vals.length * 0.66)],
    };
  }, [data, metric]);

  const isInverted = metric === 'cpa';

  const metricLabels: Record<Metric, string> = { roas: 'ROAS', cpa: 'CPA', ctr: 'CTR' };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Performance par Heure & Jour</h3>
          <p className="text-xs text-gray-500 mt-0.5">Heatmap 7 jours × 24 heures</p>
        </div>
        {/* Switcher */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {(['roas', 'cpa', 'ctr'] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                metric === m
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {metricLabels[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid wrapper — scrollable on small screens */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Hour header */}
          <div className="flex mb-1">
            <div className="w-10 shrink-0" />
            {HOURS.map((h) => (
              <div
                key={h}
                className="flex-1 text-center text-[10px] text-gray-400 font-medium"
              >
                {SHOW_HOURS.has(h) ? `${h}h` : ''}
              </div>
            ))}
          </div>

          {/* Rows: one per day */}
          {Array.from({ length: 7 }, (_, day) => (
            <div key={day} className="flex mb-0.5">
              {/* Day label */}
              <div className="w-10 shrink-0 flex items-center text-[11px] font-medium text-gray-500 pr-1">
                {DAY_LABELS[day]}
              </div>
              {/* Cells */}
              {HOURS.map((hour) => {
                const cell = cellMap.get(`${day}-${hour}`);
                const val  = cell ? getMetricValue(cell, metric) : 0;
                const bg   = cell
                  ? percentileColor(val, p33, p66, isInverted)
                  : '#f3f4f6';

                return (
                  <div
                    key={hour}
                    className="flex-1 h-[34px] flex items-center justify-center rounded-[3px] cursor-default transition-opacity hover:opacity-80 mx-px text-[9px] font-mono select-none"
                    style={{ background: bg, color: val > 0 ? '#374151' : '#9ca3af' }}
                    onMouseEnter={(e) =>
                      setTooltip({
                        visible: true,
                        x: e.clientX,
                        y: e.clientY,
                        cell: cell ?? null,
                        metric,
                      })
                    }
                    onMouseMove={(e) =>
                      setTooltip((t) => ({ ...t, x: e.clientX, y: e.clientY }))
                    }
                    onMouseLeave={() => setTooltip((t) => ({ ...t, visible: false }))}
                  >
                    {cell ? formatVal(val, metric) : '—'}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Color scale legend */}
      <div className="flex items-center gap-2 mt-3 text-[10px] text-gray-400">
        <span>{isInverted ? 'Meilleur' : 'Faible'}</span>
        <div className="flex gap-0.5 flex-1 max-w-[120px]">
          {['#fca5a5', '#fde68a', '#86efac', '#22c55e'].map((c) => (
            <div key={c} className="h-2 flex-1 rounded-sm" style={{ background: c }} />
          ))}
        </div>
        <span>{isInverted ? 'Faible' : 'Meilleur'}</span>
      </div>

      <HoverTooltip state={tooltip} />
    </div>
  );
}
