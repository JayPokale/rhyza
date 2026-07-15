export const PaymentIntentState = {
  CREATED: 'CREATED',
  COMPLETED: 'COMPLETED'
} as const;
export type PaymentIntentState = keyof typeof PaymentIntentState;

export const SentPaymentState = {
  CREATED: 'CREATED',
  PROCESSING: 'PROCESSING',
  SENDING: 'SENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED'
} as const;
export type SentPaymentState = keyof typeof SentPaymentState;

export const ReceivedPaymentState = {
  VALIDATED: 'VALIDATED',
  ACCEPTED: 'ACCEPTED',
  FINALIZED: 'FINALIZED',
  FAILED: 'FAILED'
} as const;
export type ReceivedPaymentState = keyof typeof ReceivedPaymentState;
