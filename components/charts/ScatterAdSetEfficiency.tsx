'use client';

import React, { useState } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdSetDataPoint {
  name: string;
  spend: number;
  roas: number;
  conversions: number;
  frequency: number;
}

interface Props {
  data: AdSetDataPoint[];
  breakEvenRoas?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bubbleRadius(conversions: number): number {
  return Math.min(40, Math.max(8, Math.sqrt(conversions) * 3));
}

function frequencyColor(freq: number): string {
  if (freq <= 1.5) return 'hsl(120,70%,45%)';
  if (freq <= 2.5) return 'hsl(45,90%,50%)';
  return 'hsl(0,75%,50%)';
}

function truncate(s: string, n = 12): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ─── Custom dot ───────────────────────────────────────────────────────────────

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: AdSetDataPoint;
  r?: number;
}

function CustomDot({ cx = 0, cy = 0, payload }: DotProps) {
  if (!payload) return null;
  const r = bubbleRadius(payload.conversions);
  const color = frequencyColor(payload.frequency);
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        fillOpacity={0.75}
        stroke={color}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy + r + 11}
        textAnchor="middle"
        fill="#374151"
        fontSize={10}
        fontFamily="sans-serif"
      >
        {truncate(payload.name)}
      </text>
    </g>
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: AdSetDataPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs space-y-1 max-w-[200px]">
      <p className="font-semibold text-gray-800 truncate">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600">
        <span>Dépenses</span>  <span className="font-mono text-right">${d.spend.toLocaleString()}</span>
        <span>ROAS</span>      <span className="font-mono text-right">{d.roas.toFixed(2)}x</span>
        <span>Conv.</span>     <span className="font-mono text-right">{d.conversions}</span>
        <span>Fréquence</span> <span className="font-mono text-right">{d.frequency.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function FreqLegend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      {[
        { label: 'Fréq. ≤ 1.5', color: 'hsl(120,70%,45%)' },
        { label: 'Fréq. 1.5–2.5', color: 'hsl(45,90%,50%)' },
        { label: 'Fréq. > 2.5', color: 'hsl(0,75%,50%)' },
      ].map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1 ml-2">
        <span className="inline-block w-3 h-3 rounded-full bg-gray-200 border border-dashed border-gray-400" />
        Zone cible ROAS
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScatterAdSetEfficiency({ data, breakEvenRoas = 2.0 }: Props) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (!data.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
          Aucune donnée disponible
        </div>
      </div>
    );
  }

  const maxSpend = Math.max(...data.map((d) => d.spend));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-1">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Efficience Ad Sets — Dépenses × ROAS</h3>
          <p className="text-xs text-gray-500 mt-0.5">Taille = conversions · Couleur = fréquence</p>
        </div>
        <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded px-2 py-1">
          Break-even {breakEvenRoas.toFixed(1)}x
        </span>
      </div>

      <div className="mb-3">
        <FreqLegend />
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 10, right: 30, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />

          {/* Target zone: ROAS 2.5x → 4x */}
          <ReferenceArea
            y1={2.5}
            y2={4.0}
            fill="#d1fae5"
            fillOpacity={0.4}
            stroke="#86efac"
            strokeDasharray="4 4"
          />

          {/* Break-even line */}
          <ReferenceLine
            y={breakEvenRoas}
            stroke="#f59e0b"
            strokeDasharray="5 3"
            label={{ value: `Break-even ${breakEvenRoas}x`, position: 'insideTopRight', fill: '#b45309', fontSize: 10 }}
          />

          <XAxis
            type="number"
            dataKey="spend"
            domain={[0, maxSpend * 1.15]}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'Dépenses', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="roas"
            domain={[0, 'auto']}
            tickFormatter={(v) => `${v.toFixed(1)}x`}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            label={{ value: 'ROAS', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 11 }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />

          <Scatter
            data={data}
            shape={(props: DotProps) => <CustomDot {...props} />}
            onMouseEnter={(d: AdSetDataPoint) => setHovered(d.name)}
            onMouseLeave={() => setHovered(null)}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={frequencyColor(entry.frequency)}
                fillOpacity={hovered === null || hovered === entry.name ? 0.8 : 0.3}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
