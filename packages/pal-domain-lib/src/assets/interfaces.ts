/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

'use strict';

import { PalAsset } from './entity';

export interface IPalAsset {
  code: string;
  scale: number;
  liquidityLowThreshold: bigint | null;
  liquidityHighThreshold: bigint | null;
}

export interface IAssetAggregate {
  createAsset(
    code: string,
    scale: number,
    liquidityLowThreshold?: bigint,
    liquidityHighThreshold?: bigint
  ): Promise<void>;
  getAsset(code: string): Promise<PalAsset | null>;
}

export interface IPalAssetRepository {
  store(asset: IPalAsset): Promise<void>;
  fetch(code: string): Promise<IPalAsset | null>;
}
