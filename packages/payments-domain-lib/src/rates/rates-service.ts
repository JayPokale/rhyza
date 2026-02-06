'use strict'

import {
  DestinationConversionRequest,
  DestinationConversionResponse,
  SourceConversionRequest,
  SourceConversionResponse,
  IRatesServiceAdapter
} from './rates-types'

export class RatesService implements IRatesServiceAdapter {
  public convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined> {
    throw new Error('not implemented')
  }

  public convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined> {
    throw new Error('not implemented')
  }
}
