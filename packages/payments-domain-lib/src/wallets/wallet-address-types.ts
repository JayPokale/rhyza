"use strict";

// export type WalletAddress = {
//   id: string;
//   url: string;
//   isActive: boolean;
//   assetCode: string;
//   assetScale: number;
// }

import {WalletAddress} from "common-types-lib";

export type CreateWalletAddressArgs = {
  id?: string;
  url: string;
  assetCode: string;
  assetScale: number;
}

export interface IWalletAddressService {
  getById(id: string): Promise<WalletAddress | undefined>;
  createWalletAddress(args: CreateWalletAddressArgs): Promise<string>;
}

export interface IWalletAddressRepository {
  exists(id: string): Promise<boolean>;
  store(walletAddress: WalletAddress): Promise<void>;
  fetchById(id: string): Promise<WalletAddress | undefined>;

  fetchByIds(ids: string[]): Promise<WalletAddress[]>;
}
