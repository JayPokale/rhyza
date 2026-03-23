/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

export interface ILedgerTransactionStateDTO {
    id: string;
    debitedAccountId: string;
    creditedAccountId: string;
    amount: string;
    amountScale: number;
    timestamp: number;
}

export interface ILedgerTransaction {
    id: string;
    debitedAccountId: string;
    creditedAccountId: string;
    amount: bigint;
    amountScale: number;
    timestamp: number;
}

export class TransactionSerializer {
    static toDTO(transaction: ILedgerTransaction): ILedgerTransactionStateDTO {
        return {
            id: transaction.id,
            debitedAccountId: transaction.debitedAccountId,
            creditedAccountId: transaction.creditedAccountId,
            amount: transaction.amount.toString(),
            amountScale: transaction.amountScale,
            timestamp: transaction.timestamp
        }
    }
    static fromDTO(dto: ILedgerTransactionStateDTO): ILedgerTransaction {
        return {
            id: dto.id,
            debitedAccountId: dto.debitedAccountId,
            creditedAccountId: dto.creditedAccountId,
            amount: BigInt(dto.amount),
            amountScale: dto.amountScale,
            timestamp: dto.timestamp
        }
    }

}
