/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import { IPalWalletAddress } from "./interfaces";
import {IPalAsset} from "../assets/interfaces";
import * as crypto from "node:crypto";

export class PalWalletAddress implements IPalWalletAddress {
  private _address: string;
  private _publicName: string;
  private _assetCode: string;
  private _assetScale: number;
  private _isActive: boolean;

  constructor(publicName: string, assetCode: string, assetScale: number, isActive?: boolean) {
    this._address = crypto.randomUUID();
    this._publicName = publicName;
    this._assetCode = assetCode;
    this._assetScale = assetScale;

    this._isActive = isActive == true || isActive == undefined;
  }

  static fromJSON(json: IPalWalletAddress): PalWalletAddress {
    const wallet = new PalWalletAddress(json.publicName, json.assetCode, json.assetScale, json.isActive);
    wallet._address = json.address;

    return wallet;
  }

  toJSON(): IPalWalletAddress {
    return {
      address: this._address,
      publicName: this._publicName,
      assetCode: this._assetCode,
      assetScale: this._assetScale,
      isActive: this._isActive
    };
  }

  get address(): string {
    return this._address;
  }

  get publicName(): string {
    return this._publicName;
  }

  get assetCode(): string {
    return this._assetCode;
  }

  get assetScale(): number {
    return this._assetScale;
  }

  get isActive(): boolean {
    return this._isActive;
  }
}
