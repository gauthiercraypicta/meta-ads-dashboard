/** Guard against NaN / Infinity leaking into display strings. */
function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function formatCurrency(value: number, currency = 'USD'): string {
  const v = safe(value);
  if (v === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function formatNumber(value: number): string {
  const v = safe(value);
  if (v === 0) return '0';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return Math.round(v).toLocaleString('en-US');
}

export function formatPercent(value: number, decimals = 2): string {
  const v = safe(value);
  if (v === 0) return '0.00%';
  return `${v.toFixed(decimals)}%`;
}

export function formatROAS(value: number): string {
  const v = safe(value);
  if (v === 0) return '—';
  return `${v.toFixed(2)}x`;
}

export function formatCPC(value: number, currency = 'USD'): string {
  const v = safe(value);
  if (v === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}
