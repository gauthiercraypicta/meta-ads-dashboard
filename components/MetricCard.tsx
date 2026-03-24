import type { ReactNode } from 'react';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: ReactNode;
  colorClass: string;
  loading?: boolean;
  delta?: number;
  invertDelta?: boolean; // for metrics where lower = better (CPA, CPM, CPC, Frequency)
  size?: 'default' | 'small';
}

function DeltaBadge({ delta, invert = false }: { delta: number; invert?: boolean }) {
  // Color is based on whether the change is an improvement
  const improvement = invert ? -delta : delta;
  const isGood = improvement > 2;
  const isBad = improvement < -2;

  // Display: show actual delta sign so the number matches what really happened
  const sign = delta >= 0 ? '+' : '';
  const label = `${sign}${delta.toFixed(1)}%`;

  // Arrow reflects the actual direction of change (not improvement)
  const ArrowUp = () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
    </svg>
  );
  const ArrowDown = () => (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  );

  if (isGood) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600">
        {delta >= 0 ? <ArrowUp /> : <ArrowDown />}
        {label}
      </span>
    );
  }
  if (isBad) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500">
        {delta >= 0 ? <ArrowUp /> : <ArrowDown />}
        {label}
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-gray-400">
      ≈ {label}
    </span>
  );
}

export default function MetricCard({
  title,
  value,
  subtitle,
  icon,
  colorClass,
  loading = false,
  delta,
  invertDelta = false,
  size = 'default',
}: MetricCardProps) {
  const isSmall = size === 'small';

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow ${isSmall ? 'p-3' : 'p-4'}`}>
      <div className={`flex items-center justify-between ${isSmall ? 'mb-1.5' : 'mb-3'}`}>
        <p className={`font-semibold text-gray-500 uppercase tracking-wide leading-tight ${isSmall ? 'text-[10px]' : 'text-xs'}`}>
          {title}
        </p>
        <div className={`flex-shrink-0 rounded-lg flex items-center justify-center ${colorClass} ${isSmall ? 'w-6 h-6' : 'w-8 h-8'}`}>
          <span className={isSmall ? '[&>svg]:w-3.5 [&>svg]:h-3.5' : ''}>{icon}</span>
        </div>
      </div>
      {loading ? (
        <div className={`bg-gray-200 rounded animate-pulse ${isSmall ? 'h-5 w-14' : 'h-7 w-20'}`} />
      ) : (
        <p className={`font-bold text-gray-900 leading-tight ${isSmall ? 'text-base' : 'text-xl'}`}>{value}</p>
      )}
      {!loading && (delta !== undefined || subtitle) && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          {delta !== undefined && (
            <>
              <DeltaBadge delta={delta} invert={invertDelta} />
              <span className="text-[10px] text-gray-400">vs préc.</span>
            </>
          )}
          {subtitle && (
            <span className={`text-[10px] text-gray-400 ${delta !== undefined ? 'ml-1 pl-1 border-l border-gray-200' : ''}`}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
