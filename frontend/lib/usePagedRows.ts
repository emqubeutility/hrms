import { useEffect, useMemo, useState } from 'react';
import { PAGE_SIZES } from '../components/Pagination';

/**
 * Pages a list that is already in memory. Returns the rows for the current page and the props for <Pagination />.
 * Goes back to the first page when the list changes size, and keeps the page in range when rows are removed.
 */
export function usePagedRows<T>(rows: T[], initialSize = 25) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page, pageSize]);

  return {
    pageRows,
    pagination: {
      page: Math.min(page, totalPages),
      pageSize,
      total: rows.length,
      onPageChange: (p: number) => setPage(Math.min(Math.max(1, p), totalPages)),
      onPageSizeChange: (size: number) => {
        setPageSize(size);
        setPage(1);
      },
      pageSizes: PAGE_SIZES,
    },
  };
}
