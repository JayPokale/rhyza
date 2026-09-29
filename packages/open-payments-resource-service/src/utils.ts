import { OpenPaymentsResourceServerRouteError } from './errors.js';

const DELIMITER = '_';

export function encodeCompoundId(
  paymentIntentId: string,
  quoteId: string
): string {
  return Buffer.from(`${paymentIntentId}${DELIMITER}${quoteId}`).toString(
    'base64url'
  );
}

export function decodeCompoundId(value: string): {
  paymentIntentId: string;
  quoteId: string;
} {
  const [paymentIntentId, quoteId] = Buffer.from(value, 'base64url')
    .toString('utf-8')
    .split(DELIMITER);

  if (!paymentIntentId || !quoteId) {
    throw new OpenPaymentsResourceServerRouteError(
      404,
      'Malformed id',
      'invalid_request'
    );
  }

  return { paymentIntentId, quoteId };
}
