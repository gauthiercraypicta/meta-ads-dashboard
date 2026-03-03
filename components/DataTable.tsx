'use client';

import { useState, useMemo, Fragment, type ReactNode } from 'react';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  emptyMessage?: string;
  renderExpanded?: (row: T) => ReactNode;
}

type SortDir = 'asc' | 'desc';

export default function DataTable<T extends { id: string }>({
  data,
  columns,
  emptyMessage = 'Aucune donnée disponible.',
  renderExpanded,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const an = typeof av === 'number' ? av : parseFloat(String(av ?? 0));
      const bn = typeof bv === 'number' ? bv : parseFloat(String(bv ?? 0));
      if (!isNaN(an) && !isNaN(bn)) {
        return sortDir === 'asc' ? an - bn : bn - an;
      }
      const as2 = String(av ?? '').toLowerCase();
      const bs2 = String(bv ?? '').toLowerCase();
      return sortDir === 'asc' ? as2.localeCompare(bs2) : bs2.localeCompare(as2);
    });
  }, [data, sortKey, sortDir]);

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey)
      return (
        <svg className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    return (
      <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {sortDir === 'desc' ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        )}
      </svg>
    );
  };

  const totalCols = columns.length + (renderExpanded ? 1 : 0);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {renderExpanded && <th className="w-8 px-2 py-3" />}
            {columns.map((col) => (
              <th
                key={String(col.key)}
                className={`px-4 py-3 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap group ${
                  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                } ${col.sortable ? 'cursor-pointer select-none hover:bg-gray-100 transition-colors' : ''}`}
                onClick={() => col.sortable && handleSort(String(col.key))}
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.header}
                  {col.sortable && <SortIcon colKey={String(col.key)} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {sorted.map((row, i) => (
            <Fragment key={row.id}>
              <tr className={`hover:bg-blue-50/40 transition-colors ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                {renderExpanded && (
                  <td className="px-2 py-3 w-8">
                    <button
                      onClick={() => toggleRow(row.id)}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${expandedRows.has(row.id) ? 'rotate-90' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </td>
                )}
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className={`px-4 py-3 whitespace-nowrap ${
                      col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'
                    }`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
              {renderExpanded && expandedRows.has(row.id) && (
                <tr>
                  <td colSpan={totalCols} className="p-0">
                    {renderExpanded(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        {sorted.length} résultat{sorted.length > 1 ? 's' : ''}
      </div>
    </div>
  );
}
