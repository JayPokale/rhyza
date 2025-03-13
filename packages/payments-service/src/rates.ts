import { Asset } from "./shared";

interface SourceConversionRequest {
  sourceAmount: bigint;
  sourceAsset: Asset;
  destinationAsset: Asset;
}

interface SourceConversionResponse {
  destinationAmount: bigint;
  exchangeRate: number;
}

interface DestinationConversionRequest {
  sourceAsset: Asset;
  destinationAsset: Asset;
  destinationAmount: bigint;
}

interface DestinationConversionResponse {
  sourceAmount: bigint;
  exchangeRate: number;
}

export interface RatesServiceAdapter {
  convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined>;
  convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined>;
}

export class RatesService implements RatesServiceAdapter {
  public convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined> {
    throw new Error("not implemented");
  }

  public convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined> {
    throw new Error("not implemented");
  }
}
