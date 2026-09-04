import { PaymentIntentsListPaymentIntentsRequest } from 'admin-client-lib';
import { IPageQuery } from 'payments-client-lib';

/**
 * The generated client types `first`/`last` as numbers, but they arrive as
 * strings on the wire, so they are coerced here.
 */
export function parsePageQuery(
  query: PaymentIntentsListPaymentIntentsRequest
): IPageQuery {
  return {
    walletAddressId: query.walletAddressId,
    cursor: query.cursor,
    first: query.first != null ? Number(query.first) : undefined,
    last: query.last != null ? Number(query.last) : undefined
  };
}
