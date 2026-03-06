'use client';

import { useState, useEffect, useRef } from 'react';
import { processInsights } from '@/lib/metaHelpers';
import { formatCurrency } from '@/lib/formatters';

const STORAGE_KEY = 'meta_budget_monthly_target';

interface Props {
  /** Pre-fetched monthly spend from Dashboard — skips an extra /api/account-insights call */
  monthlySpend?: number | null;
}

export default function BudgetPacing({ monthlySpend: externalSpend }: Props) {
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [budgetTarget, setBudgetTarget] = useState(0);
  const [editing, setEditing]           = useState(false);
  const [tempValue, setTempValue]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load stored budget target ─────────────────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setBudgetTarget(parseFloat(stored) || 0);
  }, []);

  // ── Fetch or receive monthly spend ────────────────────────────────────────

  useEffect(() => {
    if (externalSpend !== undefined) {
      setMonthlySpend(externalSpend ?? 0);
      setLoading(false);
      return;
    }
    fetch('/api/account-insights?date_preset=this_month')
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.[0]) setMonthlySpend(processInsights(data.data[0]).spend);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [externalSpend]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  // ── Derived metrics ───────────────────────────────────────────────────────

  const today       = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayProgress = today / daysInMonth; // 0–1

  const timePct  = dayProgress * 100;                                                // % of month elapsed
  const spendPct = budgetTarget > 0
    ? Math.min((monthlySpend / budgetTarget) * 100, 120)
    : 0;                                                                              // % of budget spent (capped 120%)
  const diff = spendPct - timePct;                                                    // positive = over-pacing

  // Color per user spec: orange if spend > time+5%, blue if spend < time-5%, green otherwise
  let barColor   = '#22C55E'; // green-500
  let labelColor = 'text-green-600';
  let statusIcon = '✓';
  let statusText = 'Pacing normal';

  if (diff > 5) {
    barColor   = '#F97316'; // orange-500
    labelColor = 'text-orange-600';
    statusIcon = '⚡';
    statusText = 'En avance sur le budget';
  } else if (diff < -5) {
    barColor   = '#3B82F6'; // blue-500
    labelColor = 'text-blue-600';
    statusIcon = '↓';
    statusText = 'En retard sur le budget';
  }

  // 3 summary metrics
  const theoreticalSpend = budgetTarget * dayProgress;
  const ecart            = monthlySpend - theoreticalSpend;
  const projection       = dayProgress > 0 ? monthlySpend / dayProgress : 0;

  // ── Budget save ───────────────────────────────────────────────────────────

  const saveBudget = () => {
    const val = parseFloat(tempValue.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val > 0) {
      setBudgetTarget(val);
      localStorage.setItem(STORAGE_KEY, String(val));
    }
    setEditing(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">

      {/* ── Header row ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">

        {/* Left: spend info + status */}
        <div className="flex items-center gap-5 flex-wrap">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Budget mensuel</p>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {loading ? (
                <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
              ) : (
                <span className="text-lg font-bold text-gray-900">{formatCurrency(monthlySpend)}</span>
              )}
              <span className="text-sm text-gray-400">ce mois-ci</span>
              {budgetTarget > 0 && (
                <>
                  <span className="text-sm text-gray-300">/</span>
                  <span className="text-sm font-semibold text-gray-600">{formatCurrency(budgetTarget)}</span>
                  <span className="text-xs text-gray-400">objectif</span>
                </>
              )}
            </div>
          </div>

          {/* Day badge */}
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
            Jour <span className="font-bold text-gray-800">{today}</span>
            <span className="text-gray-400"> / {daysInMonth}</span>
            <span className="ml-1.5 text-gray-400">({Math.round(dayProgress * 100)}% du mois)</span>
          </div>

          {/* Status label (only when budget is set) */}
          {budgetTarget > 0 && !loading && (
            <span className={`text-xs font-semibold ${labelColor}`}>
              {statusIcon} {statusText}
              <span className="font-normal text-gray-400 ml-1">
                ({diff >= 0 ? '+' : ''}{diff.toFixed(1)}% vs rythme attendu)
              </span>
            </span>
          )}
        </div>

        {/* Right: edit budget button */}
        <div>
          {editing ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">$</span>
              <input
                ref={inputRef}
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  saveBudget();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="w-28 px-2 py-1 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="ex: 10000"
              />
              <button
                onClick={saveBudget}
                className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                OK
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setTempValue(budgetTarget > 0 ? String(budgetTarget) : ''); setEditing(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {budgetTarget > 0 ? 'Modifier budget' : 'Définir budget'}
            </button>
          )}
        </div>
      </div>

      {/* ── Content: double bars or CTA ── */}
      {budgetTarget > 0 ? (
        <div className="mt-4 space-y-3">

          {/* Double progress bars */}
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm bg-gray-300 flex-shrink-0" />
                Temps écoulé · {Math.round(timePct)}%
              </span>
              <span className="flex items-center gap-1">
                Budget dépensé · {Math.round(spendPct)}%
                <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: barColor }} />
              </span>
            </div>

            {/* Time bar (gray) */}
            <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden mb-1.5">
              <div
                className="h-full bg-gray-300 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(timePct, 100)}%` }}
              />
            </div>

            {/* Spend bar (colored) */}
            <div className="relative h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(spendPct, 100)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>

            {/* Scale */}
            <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
              <span>$0</span>
              <span>{formatCurrency(budgetTarget)}</span>
            </div>
          </div>

          {/* 3 summary metrics */}
          {!loading && (
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
              <div className="text-center">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-snug">Rythme théorique</p>
                <p className="text-sm font-bold text-gray-700 mt-0.5">{formatCurrency(theoreticalSpend)}</p>
                <p className="text-[10px] text-gray-400">attendu à J{today}</p>
              </div>
              <div className="text-center border-x border-gray-100">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-snug">Écart</p>
                <p className={`text-sm font-bold mt-0.5 ${ecart >= 0 ? 'text-orange-600' : 'text-blue-600'}`}>
                  {ecart >= 0 ? '+' : ''}{formatCurrency(ecart)}
                </p>
                <p className="text-[10px] text-gray-400">vs rythme attendu</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide leading-snug">Projection</p>
                <p className={`text-sm font-bold mt-0.5 ${
                  projection > budgetTarget * 1.1
                    ? 'text-red-600'
                    : projection < budgetTarget * 0.9
                    ? 'text-blue-600'
                    : 'text-green-600'
                }`}>
                  {formatCurrency(projection)}
                </p>
                <p className="text-[10px] text-gray-400">fin de mois estimé</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* CTA when no budget defined */
        !loading && (
          <div className="mt-3 flex items-center gap-2.5 text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-2.5">
            <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              Définissez un objectif de budget mensuel pour afficher le suivi du pacing et la projection de fin de mois.
            </span>
          </div>
        )
      )}
    </div>
  );
}
