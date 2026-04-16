/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

export interface ILedgerTransactionDTO {
    id: string;
    debitedAccountId: string;
    creditedAccountId: string;
    amount: string;
    amountScale: number;
    timestamp: number;
    externalId?: string;
}

export interface ILedgerTransaction {
    id: string;
    debitedAccountId: string;
    creditedAccountId: string;
    amount: bigint;
    amountScale: number;
    timestamp: number;
    externalId?: string;
}

export class LedgerTransactionDtoSerializer {
    static toDTO(transaction: ILedgerTransaction): ILedgerTransactionDTO {
        return {
            id: transaction.id,
            debitedAccountId: transaction.debitedAccountId,
            creditedAccountId: transaction.creditedAccountId,
            amount: transaction.amount.toString(),
            amountScale: transaction.amountScale,
            timestamp: transaction.timestamp,
            externalId: transaction.externalId
        }
    }
    static fromDTO(dto: ILedgerTransactionDTO): ILedgerTransaction {
        return {
            id: dto.id,
            debitedAccountId: dto.debitedAccountId,
            creditedAccountId: dto.creditedAccountId,
            amount: BigInt(dto.amount),
            amountScale: dto.amountScale,
            timestamp: dto.timestamp,
            externalId: dto.externalId
        }
    }
}
