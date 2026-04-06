/*****
 Contributors

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

"use strict";

import { StateEvent, SnapshotEvent, SnapshotEventTopics, StateEventTopics } from 'common-types-lib';
import {ILedgerAccountStateDTO} from "../entities/ledger-account";
import {ILedgerTransactionStateDTO} from "../entities/transaction";


export abstract class LedgerStateEvent extends StateEvent {
  msgTopic: string = StateEventTopics.LedgerStateEvents;
  protected constructor(aggId: string) {
    super(aggId);
  }

  static isLedgerCreatedStateEvent(evt:StateEvent):evt is LedgerCreatedStateEvent {
    return evt.msgName === LedgerCreatedStateEvent.name;
  }
  static isLedgerAccountCreatedStateEvent(evt:StateEvent):evt is LedgerAccountCreatedStateEvent {
    return evt.msgName === LedgerAccountCreatedStateEvent.name;
  }
  static isLedgerTransactionRecordedStateEvent(evt:StateEvent):evt is LedgerTransactionRecordedStateEvent {
    return evt.msgName === LedgerTransactionRecordedStateEvent.name;
  }
}
export abstract class BaseLedgerSnapshotEvent extends SnapshotEvent{
    msgTopic:string = SnapshotEventTopics.LedgerSnapshotEvents;
    protected constructor(aggId:string, aggVersion:string) {
        super(aggId, aggVersion);
    }
}

/*
* State Events
* */

export type LedgerCreatedStatePayload = {
    id: string;
    assetScale: number;
}
export class LedgerCreatedStateEvent extends LedgerStateEvent {
  payload: LedgerCreatedStatePayload;

  constructor(aggId: string, assetScale: number) {
    super(aggId);
    this.aggregateVersion = '1';
    this.payload = {
      id: aggId,
      assetScale: assetScale
    };
  }
}


export type LedgerAccountCreatedStatePayload = {
    account:ILedgerAccountStateDTO;
}
export class LedgerAccountCreatedStateEvent extends LedgerStateEvent {
  payload: LedgerAccountCreatedStatePayload;

  constructor(
    aggId: string,
    aggVersion: string,
    payload: LedgerAccountCreatedStatePayload
  ) {
    super(aggId);
    this.aggregateVersion = aggVersion;
    this.payload = payload;
  }
}

export type LedgerTransactionRecordedStatePayload = {
    transaction: ILedgerTransactionStateDTO;
}
export class LedgerTransactionRecordedStateEvent extends LedgerStateEvent{
    payload: LedgerTransactionRecordedStatePayload;

    constructor(aggId:string, aggVersion:string, payload: LedgerTransactionRecordedStatePayload){
        super(aggId);
        this.aggregateVersion = aggVersion;
        this.payload = payload;
    };
}

/*
* Snapshot Events
* */
export type LedgerSnapshotPayload = {
    accounts: ILedgerAccountStateDTO[];
    transactionCount: string;
    assetScale: number;
}
// export class LedgerSnapshotEvent extends BaseLedgerSnapshotEvent implements IProtobuffMessage<LedgerSnapshotEvent>{
export class LedgerSnapshotEvent extends BaseLedgerSnapshotEvent{
    payload: LedgerSnapshotPayload;

    constructor(aggId:string, aggVersion:string, payload:LedgerSnapshotPayload){
        super(aggId, aggVersion);
        this.payload = payload;
    };
}
