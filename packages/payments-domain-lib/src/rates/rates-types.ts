'use strict'

import { Asset } from 'common-types-lib'

export type SourceConversionRequest = {
  sourceAmount: bigint
  sourceAsset: Asset
  destinationAsset: Asset
}

export type SourceConversionResponse = {
  destinationAmount: bigint
  exchangeRate: number
}

export type DestinationConversionRequest = {
  sourceAsset: Asset
  destinationAsset: Asset
  destinationAmount: bigint
}

export type DestinationConversionResponse = {
  sourceAmount: bigint
  exchangeRate: number
}

export interface IRatesServiceAdapter {
  convertFromSource(
    request: SourceConversionRequest
  ): Promise<SourceConversionResponse | undefined>

  convertFromDestination(
    request: DestinationConversionRequest
  ): Promise<DestinationConversionResponse | undefined>
}
