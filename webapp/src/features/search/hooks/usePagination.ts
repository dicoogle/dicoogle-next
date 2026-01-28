import { useState, useEffect } from "react";

export interface PaginationResult<T> {
  currentPage: number;
  totalPages: number;
  paginatedItems: T[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  isFirstPage: boolean;
  isLastPage: boolean;
  startIndex: number;
  endIndex: number;
}

export function usePagination<T>(
  items: T[],
  pageSize: number,
): PaginationResult<T> {
  const [currentPage, setCurrentPage] = useState(0);

  const totalPages = Math.ceil(items.length / pageSize);
  const startIndex = currentPage * pageSize;
  const endIndex = Math.min(startIndex + pageSize, items.length);
  const paginatedItems = items.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    const validPage = Math.max(0, Math.min(page, totalPages - 1));
    setCurrentPage(validPage);
  };

  const nextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const previousPage = () => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  // Reset to first page when items change
  useEffect(() => {
    setCurrentPage(0);
  }, [items.length]);

  return {
    currentPage,
    totalPages,
    paginatedItems,
    goToPage,
    nextPage,
    previousPage,
    isFirstPage: currentPage === 0,
    isLastPage: currentPage >= totalPages - 1,
    startIndex,
    endIndex,
  };
}
