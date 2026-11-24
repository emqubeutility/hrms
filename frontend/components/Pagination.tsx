import React from 'react';

export const PAGE_SIZES = [10, 25, 50, 100];

/** Page numbers to show: the first and last page, the current one and its neighbours, with gaps marked as null. */
function pageNumbers(page: number, totalPages: number): (number | null)[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

const BUTTON = 'min-w-[2rem] rounded-md border px-2.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Pager for every listing: "Showing a–b of n", rows per page, and page numbers with previous and next.
 * Server-paged lists pass the totals from the API; client-side lists pass their own (see usePagedRows).
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = PAGE_SIZES,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizes?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(current * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
      <div>
        {total === 0 ? 'No rows' : `Showing ${from}–${to} of ${total}`}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {pageSizes.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <nav aria-label="Pages" className="flex items-center gap-1">
          <button type="button" className={`${BUTTON} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} onClick={() => onPageChange(current - 1)} disabled={current <= 1} aria-label="Previous page">
            ‹
          </button>
          {pageNumbers(current, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-gray-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === current ? 'page' : undefined}
                className={`${BUTTON} ${p === current ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                {p}
              </button>
            ),
          )}
          <button type="button" className={`${BUTTON} border-gray-300 bg-white text-gray-700 hover:bg-gray-50`} onClick={() => onPageChange(current + 1)} disabled={current >= totalPages} aria-label="Next page">
            ›
          </button>
        </nav>
      </div>
    </div>
  );
}
