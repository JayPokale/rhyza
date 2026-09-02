export interface PageQuerystring {
  walletAddressId?: string;
  cursor?: string;
  first?: string;
  last?: string;
}

export function parsePageQuery(query: PageQuerystring): {
  walletAddressId?: string;
  cursor?: string;
  first?: number;
  last?: number;
} {
  return {
    walletAddressId: query.walletAddressId,
    cursor: query.cursor,
    first: query.first != null ? Number(query.first) : undefined,
    last: query.last != null ? Number(query.last) : undefined
  };
}
