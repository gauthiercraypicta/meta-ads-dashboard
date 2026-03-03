'use client';

import { useState, useEffect, useRef } from 'react';
import { processInsights } from '@/lib/metaHelpers';
import { formatCurrency } from '@/lib/formatters';

const STORAGE_KEY = 'meta_budget_monthly_target';

export default function BudgetPacing() {
  const [monthlySpend, setMonthlySpend] = useState(0);
  const [loading, setLoading] = useState(true);
  const [budgetTarget, setBudgetTarget] = useState(0);
  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setBudgetTarget(parseFloat(stored) || 0);
  }, []);

  useEffect(() => {
    fetch('/api/account-insights?date_preset=this_month')
      .then((r) => r.json())
      .then((data) => {
        if (data.data?.[0]) {
          const m = processInsights(data.data[0]);
          setMonthlySpend(m.spend);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const today = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dayProgress = today / daysInMonth;
  const spendProgress = budgetTarget > 0 ? Math.min(monthlySpend / budgetTarget, 1.2) : 0;
  const pacingRatio = dayProgress > 0 ? (monthlySpend / (budgetTarget * dayProgress)) : 0;
  const pacingDiff = (pacingRatio - 1) * 100;

  let barColor = 'bg-green-500';
  let statusLabel = '✓ Pacing normal';
  let statusClass = 'text-green-600';
  if (pacingDiff > 20)       { barColor = 'bg-red-500';    statusLabel = '⚠ Sur-dépense';       statusClass = 'text-red-600'; }
  else if (pacingDiff > 10)  { barColor = 'bg-orange-500'; statusLabel = '~ En avance';          statusClass = 'text-orange-500'; }
  else if (pacingDiff < -20) { barColor = 'bg-red-400';    statusLabel = '⚠ En retard';          statusClass = 'text-red-500'; }
  else if (pacingDiff < -10) { barColor = 'bg-amber-400';  statusLabel = '~ Légèrement en retard'; statusClass = 'text-amber-600'; }

  const saveBudget = () => {
    const val = parseFloat(tempValue.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val > 0) {
      setBudgetTarget(val);
      localStorage.setItem(STORAGE_KEY, String(val));
    }
    setEditing(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Left block */}
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

          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5">
            Jour <span className="font-bold text-gray-800">{today}</span>
            <span className="text-gray-400"> / {daysInMonth}</span>
            <span className="ml-1.5 text-gray-400">({Math.round(dayProgress * 100)}% du mois)</span>
          </div>

          {budgetTarget > 0 && !loading && (
            <span className={`text-xs font-semibold ${statusClass}`}>
              {statusLabel}
              <span className="font-normal text-gray-400 ml-1">
                ({pacingDiff >= 0 ? '+' : ''}{pacingDiff.toFixed(1)}% vs attendu)
              </span>
            </span>
          )}
        </div>

        {/* Right: edit budget */}
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
                  if (e.key === 'Enter') saveBudget();
                  if (e.key === 'Escape') setEditing(false);
                }}
                className="w-28 px-2 py-1 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="ex: 10000"
              />
              <button onClick={saveBudget} className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold">
                OK
              </button>
              <button onClick={() => setEditing(false)} className="px-2.5 py-1 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors">
                ✕
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setTempValue(budgetTarget > 0 ? String(budgetTarget) : ''); setEditing(true); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {budgetTarget > 0 ? 'Modifier budget' : 'Définir budget'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {budgetTarget > 0 && (
        <div className="mt-3">
          <div className="relative h-2 bg-gray-100 rounded-full overflow-visible">
            {/* Day progress marker */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-400 rounded-full z-10"
              style={{ left: `${Math.min(dayProgress * 100, 100)}%` }}
              title={`Jour ${today} : ${Math.round(dayProgress * 100)}% du mois`}
            />
            {/* Spend bar */}
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor}`}
              style={{ width: `${Math.min((monthlySpend / budgetTarget) * 100, 100)}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
            <span>$0</span>
            <span className="text-gray-500">
              {budgetTarget > 0 && `${Math.round((monthlySpend / budgetTarget) * 100)}% dépensé`}
            </span>
            <span>{formatCurrency(budgetTarget)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
