/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";


import {CannotCreateDuplicateWalletAddressError} from "./errors";
import {IPalWalletAddress, IPalWalletAddressRepository, IWalletAddressAggregate} from "./interfaces";
import {PalWalletAddress} from "./entity";

export class WalletAddressAggregate implements IWalletAddressAggregate {
  private _repo: IPalWalletAddressRepository;

  constructor(repo: IPalWalletAddressRepository) {
    this._repo = repo;
  }

  async createWalletAddress(publicName: string, assetCode:string, assetScale: number, isActive: boolean = true): Promise<string> {
    const existing = await this._repo.fetchByPublicName(publicName);

    if (existing) {
      throw new CannotCreateDuplicateWalletAddressError("Wallet with address: " + publicName + " already exists");
    }

    // TODO: validate inputs

    const newWallet = new PalWalletAddress(
      publicName,
      assetCode,
      assetScale,
      isActive
    );

    await this._repo.store(newWallet.toJSON());

    return newWallet.address
  }


  async getWalletAddress(address: string): Promise<IPalWalletAddress | null> {
    const found = await this._repo.fetch(address);

    if (!found) return null;

    return PalWalletAddress.fromJSON(found);
  }
}
