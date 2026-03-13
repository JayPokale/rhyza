import {
  DestinationConversionRequest,
  DestinationConversionResponse,
  IRatesServiceAdapter,
  SourceConversionRequest,
  SourceConversionResponse
} from '../../src/payment-intent/interfaces';

export class MockRatesServiceAdapter implements IRatesServiceAdapter {
  public exchangeRate = 1;

  async convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined> {
    return {
      destinationAmount: BigInt(
        Math.floor(Number(request.sourceAmount) * this.exchangeRate)
      ),
      exchangeRate: this.exchangeRate
    };
  }

  async convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined> {
    return {
      sourceAmount: BigInt(
        Math.ceil(Number(request.destinationAmount) / this.exchangeRate)
      ),
      exchangeRate: this.exchangeRate
    };
  }
}
