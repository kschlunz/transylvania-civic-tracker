"use client";

import { useCallback, useState, useRef } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  scrollTargetId?: string;
}

export default function Pagination({ currentPage, totalPages, onPageChange, scrollTargetId }: PaginationProps) {
  const [inputValue, setInputValue] = useState(String(currentPage));
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep input in sync when currentPage changes externally
  if (inputValue !== String(currentPage) && document.activeElement !== inputRef.current) {
    setInputValue(String(currentPage));
  }

  const handlePageChange = useCallback((page: number) => {
    onPageChange(page);
    setInputValue(String(page));
    if (scrollTargetId) {
      document.getElementById(scrollTargetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [onPageChange, scrollTargetId]);

  const handleInputSubmit = useCallback(() => {
    const parsed = parseInt(inputValue, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= totalPages && parsed !== currentPage) {
      handlePageChange(parsed);
    } else {
      setInputValue(String(currentPage));
    }
  }, [inputValue, totalPages, currentPage, handlePageChange]);

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-4 pt-8">
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex items-center gap-1 px-3 py-2 text-sm font-label font-bold text-primary disabled:text-on-surface-variant/30 disabled:cursor-not-allowed hover:bg-primary/5 rounded-md transition-colors min-h-[44px]"
      >
        <span className="material-symbols-outlined text-sm">chevron_left</span>
        Previous
      </button>
      <span className="text-xs font-label font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
        Page
        <input
          type="text"
          inputMode="numeric"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleInputSubmit}
          onKeyDown={(e) => { if (e.key === "Enter") { handleInputSubmit(); inputRef.current?.blur(); } }}
          ref={inputRef}
          className="w-10 text-center bg-surface-container-low border border-outline-variant/30 rounded px-1 py-0.5 text-xs font-bold text-primary focus:ring-1 focus:ring-primary focus:border-primary outline-none"
        />
        of {totalPages}
      </span>
      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex items-center gap-1 px-3 py-2 text-sm font-label font-bold text-primary disabled:text-on-surface-variant/30 disabled:cursor-not-allowed hover:bg-primary/5 rounded-md transition-colors min-h-[44px]"
      >
        Next
        <span className="material-symbols-outlined text-sm">chevron_right</span>
      </button>
    </div>
  );
}

/** Helper to paginate an array. Returns { paginated, totalPages }. */
export function paginate<T>(items: T[], page: number, pageSize: number = 10): { paginated: T[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  return {
    paginated: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    totalPages,
  };
}
