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

export interface IPageQuery {
  walletAddressId?: string;
  /** Boundary resource id from a previous page's startCursor/endCursor. */
  cursor?: string;
  /** Page size, paginating forward from the cursor. Mutually exclusive with `last`. */
  first?: number;
  /** Page size, paginating backward from the cursor (requires `cursor`). */
  last?: number;
}

export interface IPageInfo {
  startCursor?: string;
  endCursor?: string;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface IPage<T> {
  /** Always in ascending (createdAt, id) order, regardless of direction. */
  items: T[];
  pagination: IPageInfo;
}
