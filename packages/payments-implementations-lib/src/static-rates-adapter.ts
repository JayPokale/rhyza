import {
  DestinationConversionRequest,
  DestinationConversionResponse,
  IRatesServiceAdapter,
  SourceConversionRequest,
  SourceConversionResponse
} from 'payments-domain-lib';

export class StaticRatesService implements IRatesServiceAdapter {
  public async convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined> {
    return {
      exchangeRate: 1,
      destinationAmount: request.sourceAmount
    };
  }

  public async convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined> {
    return {
      exchangeRate: 1,
      sourceAmount: request.destinationAmount
    };
  }
}
