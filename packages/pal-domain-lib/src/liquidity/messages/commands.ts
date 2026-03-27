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
}


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
