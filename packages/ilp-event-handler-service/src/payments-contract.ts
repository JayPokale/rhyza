// Contract for Payments BC events consumed by the ILP receiving-quote flow.
// Payments BC publishes these on `payment-domain-events`.

export const PAYMENTS_REMOTE_QUOTE_CALCULATED_EVENT =
  'RemoteQuoteCalculatedEvent';
export const PAYMENTS_REMOTE_QUOTE_CALCULATION_FAILED_EVENT =
  'RemoteQuoteCalculationFailedEvent';

export interface RemoteQuoteCalculatedPayload {
  peerId: string;
  packetId: string;
  destinationAmount: string;
}

export interface RemoteQuoteCalculationFailedPayload {
  peerId: string;
  packetId: string;
  reason?: string;
}
