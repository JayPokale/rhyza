export interface IClientErrorResponse {
  error: {
    code: string;
    description: string;
  };
}

export interface IAmount {
  value: bigint;
  assetCode: string;
  assetScale: number;
}

/** Order of a page's results by creation time. */
export type PageSortOrder = 'asc' | 'desc';

export interface IPageQuery {
  walletAddressId?: string;
  /** Opaque cursor from a previous page's startCursor/endCursor. */
  cursor?: string;
  /** Page size, paginating forward from the cursor. Mutually exclusive with `last`. */
  first?: number;
  /** Page size, paginating backward from the cursor (requires `cursor`). */
  last?: number;
  /** Ordering by creation time. Omit to use the server default (newest first). */
  sortOrder?: PageSortOrder;
}

export interface IPageInfo {
  startCursor?: string;
  endCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface IPage<T> {
  /**
   * In the requested (createdAt, id) sortOrder, regardless of whether the
   * page was reached by paginating forward or backward.
   */
  items: T[];
  pagination: IPageInfo;
}
