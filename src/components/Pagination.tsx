'use client';

import { Select } from '@/components/ui/Input';

// Site-wide standard page-size options for every employee table in the app — do not vary this
// list per table.
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 50, 75, 100, 250] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between mt-3 text-xs flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <span className="text-gray-500">
          Page {page} of {totalPages} · {total} total
        </span>
        <Select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="text-xs py-1"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="border border-gray-300 rounded-input px-2 py-1 text-gray-700 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="border border-gray-300 rounded-input px-2 py-1 text-gray-700 hover:border-gray-400 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Next
        </button>
      </div>
    </div>
  );
}
