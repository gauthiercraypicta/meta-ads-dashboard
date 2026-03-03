export function formatCurrency(value: number, currency = 'USD'): string {
  if (value === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return Math.round(value).toLocaleString('en-US');
}

export function formatPercent(value: number, decimals = 2): string {
  if (value === 0) return '0.00%';
  return `${value.toFixed(decimals)}%`;
}

export function formatROAS(value: number): string {
  if (value === 0) return '—';
  return `${value.toFixed(2)}x`;
}

export function formatCPC(value: number, currency = 'USD'): string {
  if (value === 0) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
