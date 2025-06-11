/*****
 Copyright © 2025 & The People's Clearing House
 ----------------------------------------------
 Contributors

 * Interledger Foundation / Cyberbones
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import {AssetAccount, LedgerAccount, LedgerTransfer, PeerAccount, WalletAddressAccount} from "./types";


export interface ILedgerService {
    // for async initialisation that cannot be done in the constructor
    init(): Promise<void>;
    createAccounts(accounts: LedgerAccount[]): Promise<void>;
    createTransfers(transfers: LedgerTransfer[]): Promise<void>;
}


export interface IAssetAccountRepository {
    store(entity: AssetAccount): Promise<void>;
    existsByCode(id: string): Promise<boolean>;
    fetchByCode(code: string): Promise<AssetAccount | undefined>;
}

export interface IWalletAddressAccountRepository {
    store(entity: WalletAddressAccount): Promise<void>;
    exists(id: string): Promise<boolean>;
    fetchById(id: string): Promise<WalletAddressAccount | undefined>;
}

export interface IPeerAccountRepository {
    store(entity: PeerAccount): Promise<void>;
    exists(id: string): Promise<boolean>;
    fetchById(id: string): Promise<PeerAccount | undefined>;
}
