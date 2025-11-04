/**
 * Advanced Query Builder
 * Fluent API for building complex API queries
 */

export interface QueryParams {
  [key: string]: any;
}

export interface SortOption {
  field: string;
  order: 'asc' | 'desc';
}

export interface FilterOption {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains' | 'startsWith' | 'endsWith';
  value: any;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  offset?: number;
}

/**
 * Query Builder Class
 */
export class QueryBuilder {
  private baseUrl: string;
  private params: QueryParams = {};
  private filters: FilterOption[] = [];
  private sorts: SortOption[] = [];
  private pagination: PaginationOptions = {};
  private selectedFields: string[] = [];

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Add a filter condition
   */
  filter(field: string, operator: FilterOption['operator'], value: any): this {
    this.filters.push({ field, operator, value });
    return this;
  }

  /**
   * Shorthand filters
   */
  where(field: string, value: any): this {
    return this.filter(field, 'eq', value);
  }

  whereNot(field: string, value: any): this {
    return this.filter(field, 'ne', value);
  }

  whereIn(field: string, values: any[]): this {
    return this.filter(field, 'in', values);
  }

  whereNotIn(field: string, values: any[]): this {
    return this.filter(field, 'nin', values);
  }

  whereGreaterThan(field: string, value: any): this {
    return this.filter(field, 'gt', value);
  }

  whereGreaterThanOrEqual(field: string, value: any): this {
    return this.filter(field, 'gte', value);
  }

  whereLessThan(field: string, value: any): this {
    return this.filter(field, 'lt', value);
  }

  whereLessThanOrEqual(field: string, value: any): this {
    return this.filter(field, 'lte', value);
  }

  whereContains(field: string, value: string): this {
    return this.filter(field, 'contains', value);
  }

  whereStartsWith(field: string, value: string): this {
    return this.filter(field, 'startsWith', value);
  }

  whereEndsWith(field: string, value: string): this {
    return this.filter(field, 'endsWith', value);
  }

  /**
   * Add sorting
   */
  sort(field: string, order: 'asc' | 'desc' = 'asc'): this {
    this.sorts.push({ field, order });
    return this;
  }

  sortBy(field: string): this {
    return this.sort(field, 'asc');
  }

  sortByDesc(field: string): this {
    return this.sort(field, 'desc');
  }

  /**
   * Pagination
   */
  page(page: number): this {
    this.pagination.page = page;
    return this;
  }

  limit(limit: number): this {
    this.pagination.limit = limit;
    return this;
  }

  offset(offset: number): this {
    this.pagination.offset = offset;
    return this;
  }

  /**
   * Field selection
   */
  select(...fields: string[]): this {
    this.selectedFields = fields;
    return this;
  }

  /**
   * Custom parameters
   */
  param(key: string, value: any): this {
    this.params[key] = value;
    return this;
  }

  setParams(params: QueryParams): this {
    Object.assign(this.params, params);
    return this;
  }

  /**
   * Search
   */
  search(query: string): this {
    this.params.search = query;
    return this;
  }

  /**
   * Build the query string
   */
  build(): string {
    const params: QueryParams = { ...this.params };

    // Add filters
    if (this.filters.length > 0) {
      this.filters.forEach((filter, index) => {
        const key = `filter[${index}][${filter.field}][${filter.operator}]`;
        params[key] = filter.value;
      });
    }

    // Add sorting
    if (this.sorts.length > 0) {
      params.sort = this.sorts.map(s => `${s.order === 'desc' ? '-' : ''}${s.field}`).join(',');
    }

    // Add pagination
    if (this.pagination.page !== undefined) {
      params.page = this.pagination.page;
    }
    if (this.pagination.limit !== undefined) {
      params.limit = this.pagination.limit;
    }
    if (this.pagination.offset !== undefined) {
      params.offset = this.pagination.offset;
    }

    // Add field selection
    if (this.selectedFields.length > 0) {
      params.fields = this.selectedFields.join(',');
    }

    // Build query string
    const queryString = Object.entries(params)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return value.map(v => `${key}[]=${encodeURIComponent(v)}`).join('&');
        }
        return `${key}=${encodeURIComponent(value)}`;
      })
      .join('&');

    return queryString ? `${this.baseUrl}?${queryString}` : this.baseUrl;
  }

  /**
   * Get URL
   */
  toString(): string {
    return this.build();
  }

  /**
   * Clone the query builder
   */
  clone(): QueryBuilder {
    const cloned = new QueryBuilder(this.baseUrl);
    cloned.params = { ...this.params };
    cloned.filters = [...this.filters];
    cloned.sorts = [...this.sorts];
    cloned.pagination = { ...this.pagination };
    cloned.selectedFields = [...this.selectedFields];
    return cloned;
  }

  /**
   * Reset the query builder
   */
  reset(): this {
    this.params = {};
    this.filters = [];
    this.sorts = [];
    this.pagination = {};
    this.selectedFields = [];
    return this;
  }
}

/**
 * Create a query builder
 */
export function query(baseUrl: string): QueryBuilder {
  return new QueryBuilder(baseUrl);
}

/**
 * Pagination Helper
 */
export interface PaginationState {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: PaginationState;
}

export class PaginationHelper {
  /**
   * Calculate pagination state
   */
  static calculateState(
    currentPage: number,
    totalItems: number,
    itemsPerPage: number
  ): PaginationState {
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    return {
      currentPage,
      totalPages,
      totalItems,
      itemsPerPage,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1
    };
  }

  /**
   * Get page range for pagination UI
   */
  static getPageRange(
    currentPage: number,
    totalPages: number,
    maxVisible: number = 5
  ): number[] {
    const range: number[] = [];
    const halfVisible = Math.floor(maxVisible / 2);

    let start = Math.max(1, currentPage - halfVisible);
    let end = Math.min(totalPages, start + maxVisible - 1);

    // Adjust start if we're near the end
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      range.push(i);
    }

    return range;
  }

  /**
   * Create pagination result
   */
  static createResult<T>(
    data: T[],
    currentPage: number,
    totalItems: number,
    itemsPerPage: number
  ): PaginationResult<T> {
    return {
      data,
      pagination: this.calculateState(currentPage, totalItems, itemsPerPage)
    };
  }
}

/**
 * React Hook for Query Builder
 */
import { useState, useCallback, useMemo } from 'react';

export function useQueryBuilder(baseUrl: string) {
  const [builder] = useState(() => new QueryBuilder(baseUrl));
  const [, forceUpdate] = useState({});

  const refresh = useCallback(() => {
    forceUpdate({});
  }, []);

  const methods = useMemo(
    () => ({
      where: (...args: Parameters<QueryBuilder['where']>) => {
        builder.where(...args);
        refresh();
        return methods;
      },
      sort: (...args: Parameters<QueryBuilder['sort']>) => {
        builder.sort(...args);
        refresh();
        return methods;
      },
      page: (...args: Parameters<QueryBuilder['page']>) => {
        builder.page(...args);
        refresh();
        return methods;
      },
      limit: (...args: Parameters<QueryBuilder['limit']>) => {
        builder.limit(...args);
        refresh();
        return methods;
      },
      search: (...args: Parameters<QueryBuilder['search']>) => {
        builder.search(...args);
        refresh();
        return methods;
      },
      select: (...args: Parameters<QueryBuilder['select']>) => {
        builder.select(...args);
        refresh();
        return methods;
      },
      build: () => builder.build(),
      reset: () => {
        builder.reset();
        refresh();
        return methods;
      }
    }),
    [builder, refresh]
  );

  return {
    ...methods,
    url: builder.build(),
    builder
  };
}

/**
 * React Hook for Pagination
 */
export function usePagination(totalItems: number, itemsPerPage: number = 10) {
  const [currentPage, setCurrentPage] = useState(1);

  const pagination = useMemo(
    () => PaginationHelper.calculateState(currentPage, totalItems, itemsPerPage),
    [currentPage, totalItems, itemsPerPage]
  );

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, pagination.totalPages)));
  }, [pagination.totalPages]);

  const nextPage = useCallback(() => {
    if (pagination.hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  }, [pagination.hasNextPage]);

  const previousPage = useCallback(() => {
    if (pagination.hasPreviousPage) {
      setCurrentPage(prev => prev - 1);
    }
  }, [pagination.hasPreviousPage]);

  const reset = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    currentPage,
    pagination,
    goToPage,
    nextPage,
    previousPage,
    reset,
    pageRange: PaginationHelper.getPageRange(currentPage, pagination.totalPages)
  };
}
