export interface QuoteCalculationRequest {
  peerId: string;
  packetId: string;
  paymentIntentId: string;
  incomingAmount: string;
}

export type QuoteCalculationResult =
  | { ok: true; destinationAmount: string }
  | { ok: false; reason?: string };

export interface IQuoteCalculator {
  calculate(request: QuoteCalculationRequest): Promise<QuoteCalculationResult>;
}

// FX rate defaults to 1:1, so the destination amount echoes the incoming amount.
export class FixedRateQuoteCalculator implements IQuoteCalculator {
  constructor(
    private readonly _rateNum: bigint = 1n,
    private readonly _rateDen: bigint = 1n
  ) {}

  async calculate(
    request: QuoteCalculationRequest
  ): Promise<QuoteCalculationResult> {
    if (!/^\d+$/.test(request.incomingAmount)) {
      return { ok: false, reason: 'invalid incoming amount' };
    }
    const destinationAmount =
      (BigInt(request.incomingAmount) * this._rateNum) / this._rateDen;
    return { ok: true, destinationAmount: destinationAmount.toString() };
  }
}
