/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import { CommandMsg, CommandTopics } from 'common-types-lib';

export abstract class LedgerCommand extends CommandMsg{
    msgTopic:string = CommandTopics.LedgerCommands;
    protected constructor(aggId:string) {
        super(aggId);
        this.msgKey = aggId;
    }

    static isCreateLedgerCmd(cmd:CommandMsg):cmd is CreateLedgerCmd {
        return cmd.msgName === CreateLedgerCmd.name;
    }
    static isCreateLedgerAccountCmd(cmd:CommandMsg):cmd is CreateLedgerAccountCmd {
        return cmd.msgName === CreateLedgerAccountCmd.name;
    }
    static isPostTransactionCmd(cmd:CommandMsg):cmd is PostTransactionCmd {
        return cmd.msgName === PostTransactionCmd.name;
    }
    static isReserveTransferCmd(cmd:CommandMsg):cmd is ReserveTransferCmd {
        return cmd.msgName === ReserveTransferCmd.name;
    }
    static isCheckBalanceAndReserveCmd(cmd:CommandMsg):cmd is CheckBalanceAndReserveCmd {
        return cmd.msgName === CheckBalanceAndReserveCmd.name;
    }
    static isCommitTransferCmd(cmd:CommandMsg):cmd is CommitTransferCmd {
        return cmd.msgName === CommitTransferCmd.name;
    }
    static isRejectTransferCmd(cmd:CommandMsg):cmd is RejectTransferCmd {
        return cmd.msgName === RejectTransferCmd.name;
    }
}

/*
* Lowlevel commands
* */

export interface CreateLedgerCmdPayload {
    id: string;
}
export class CreateLedgerCmd extends LedgerCommand{
    payload: CreateLedgerCmdPayload;
    constructor( payload: CreateLedgerCmdPayload) {
        super(payload.id);
        this.payload = payload;
    }
}


export interface CreateLedgerAccountCmdPayload {
    id: string;
    assetCode: string;
    assetDisplayScale: number;
    name: string;
}
export class CreateLedgerAccountCmd extends LedgerCommand{
    payload: CreateLedgerAccountCmdPayload;
    constructor(aggId:string, payload: CreateLedgerAccountCmdPayload) {
        super(aggId);
        this.payload = payload;
    }
}


export interface PostTransactionCmdPayload {
    id: string;
    debitedAccountId: string;
    creditedAccountId: string;
    amount: string;
    amountScale: number;
}
export class PostTransactionCmd extends LedgerCommand{
    payload: PostTransactionCmdPayload;
    constructor(aggId:string, payload: PostTransactionCmdPayload) {
        super(aggId);
        this.payload = payload;
    }
}


/*
* High level commands
* */

export interface CheckBalanceAndReserveCmdPayload {
  requestId: string;
  transactionId: string;
  payerClearingAccountId: string;
  payerLiquidityAccountId: string;
  suspenseAccountId: string;
  amount: string;
  amountScale: number;
}
export class CheckBalanceAndReserveCmd extends LedgerCommand{
  payload: CheckBalanceAndReserveCmdPayload;
  constructor(aggId:string, payload: CheckBalanceAndReserveCmdPayload) {
    super(aggId);
    this.payload = payload;
  }
}


export interface ReserveTransferCmdPayload {
  requestId: string;
  transactionId: string;
  payerClearingAccountId: string;
  suspenseAccountId: string;
  amount: string;
  amountScale: number;
}
export class ReserveTransferCmd extends LedgerCommand{
  payload: ReserveTransferCmdPayload;
  constructor(aggId:string, payload: ReserveTransferCmdPayload) {
    super(aggId);
    this.payload = payload;
  }
}


export interface CommitTransferCmdPayload {
  requestId: string;
  transactionId: string;
  payerClearingAccountId: string;
  suspenseAccountId: string;
  payeeClearingAccountId: string;
  amount: string;
  amountScale: number;
}
export class CommitTransferCmd extends LedgerCommand{
  payload: CommitTransferCmdPayload;
  constructor(aggId:string, payload: CommitTransferCmdPayload) {
    super(aggId);
    this.payload = payload;
  }
}

export interface RejectTransferCmdPayload {
  requestId: string;
  transactionId: string;
  payerClearingAccountId: string;
  suspenseAccountId: string;
  amount: string;
  amountScale: number;
}
export class RejectTransferCmd extends LedgerCommand{
  payload: RejectTransferCmdPayload;
  constructor(aggId:string, payload: RejectTransferCmdPayload) {
    super(aggId);
    this.payload = payload;
  }
}
