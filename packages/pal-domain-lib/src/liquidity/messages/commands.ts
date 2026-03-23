/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";



import { CommandMsg, CommandTopics } from 'common-types-lib';

export abstract class BaseLedgerCommandMsg extends CommandMsg{
    msgTopic:string = CommandTopics.LedgerCommands;
    protected constructor(aggId:string) {
        super(aggId);
        this.msgKey = aggId;
    }
}


export interface CreateLedgerCmdPayload {
    id: string;
}
export class CreateLedgerCmd extends BaseLedgerCommandMsg{
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
export class CreateLedgerAccountCmd extends BaseLedgerCommandMsg{
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
export class PostTransactionCmd extends BaseLedgerCommandMsg{
    payload: PostTransactionCmdPayload;
    constructor(aggId:string, payload: PostTransactionCmdPayload) {
        super(aggId);
        this.payload = payload;
    }
}
