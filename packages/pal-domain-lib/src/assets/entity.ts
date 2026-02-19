/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import { IPalAsset } from "./interfaces";

export class PalAsset implements IPalAsset{
  private _code: string;
  private _scale: number;
  private _liquidityLowThreshold: bigint | null;
  private _liquidityHighThreshold: bigint | null;

  constructor(code: string, scale: number, liquidityLowThreshold: bigint | null = null, liquidityHighThreshold: bigint | null = null) {
    this._code = code;
    this._scale = scale;
    this._liquidityLowThreshold = liquidityLowThreshold;
    this._liquidityHighThreshold = liquidityHighThreshold;
  }

  static fromJSON(json: IPalAsset): PalAsset {
    return new PalAsset(json.code, json.scale, json.liquidityLowThreshold, json.liquidityHighThreshold);
  }

  toJSON(): IPalAsset {
    return {
      code: this._code,
      scale: this._scale,
      liquidityLowThreshold: this._liquidityLowThreshold,
      liquidityHighThreshold: this._liquidityHighThreshold
    }
  }

  get code(): string {
    return this._code;
  }

  get scale(): number {
    return this._scale;
  }

  get liquidityLowThreshold(): bigint | null {
    return this._liquidityLowThreshold;
  }

  get liquidityHighThreshold(): bigint | null {
    return this._liquidityHighThreshold;
  }

}
