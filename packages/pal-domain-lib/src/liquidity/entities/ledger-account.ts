/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

export interface ILedgerAccountStateDTO{
    id: string;
    name: string;
    assetCode: string;
    assetDisplayScale: number;
    debitedAmount: string;
    creditedAmount: string;
}

export interface ILedgerAccount{
    id: string;
    name: string;
    assetCode: string;
    assetDisplayScale: number;
    debitedAmount: bigint;
    creditedAmount: bigint;
}

export class LedgerAccountSerializer{
    static toDTO(ledgerAccount:ILedgerAccount):ILedgerAccountStateDTO{
        return {
            id: ledgerAccount.id,
            name: ledgerAccount.name,
            assetCode: ledgerAccount.assetCode,
            assetDisplayScale: ledgerAccount.assetDisplayScale,
            debitedAmount: ledgerAccount.debitedAmount.toString(),
            creditedAmount: ledgerAccount.creditedAmount.toString()
        }
    }
    static fromDTO(dto:ILedgerAccountStateDTO):ILedgerAccount{
        return {
            id: dto.id,
            name: dto.name,
            assetCode: dto.assetCode,
            assetDisplayScale: dto.assetDisplayScale,
            debitedAmount: BigInt(dto.debitedAmount),
            creditedAmount: BigInt(dto.creditedAmount)
        }
    }
}
