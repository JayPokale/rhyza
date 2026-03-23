/*****
 Contributors

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

"use strict";

import {ILedgerAccount, LedgerAccountSerializer} from "./entities/ledger-account";
import {ILedgerTransaction, TransactionSerializer} from "./entities/transaction";
import {
  LedgerAccountCreatedStateEvent, LedgerCreatedStateEvent,
  LedgerSnapshotEvent, LedgerSnapshotPayload, LedgerStateEvents,
  LedgerTransactionRecordedStateEvent,
} from "./messages/events";
import {
    CreateLedgerAccountCmd,
    PostTransactionCmd
} from "./messages/commands";
import * as console from "node:console";
import {BaseMessage, CommandMsg, ILogger, MessageTypes, SnapshotEvent, StateEvent } from "common-types-lib";

const MAX_EVENTS_PER_SNAPSHOT = 10;

export class Ledger {
    private readonly _id: string;   // ledger id is the asset code
    private readonly _logger:ILogger;
    private _version: bigint;
    private _assetScale: number;
    private _accounts: ILedgerAccount[];
    private _transactionCount: bigint;
    private _lastSnapshotVersion: bigint;

    private readonly _uncommittedEvents: LedgerStateEvents[];

    //private _esRepo: IEventSourcingRepository;

    private constructor(id: string, assetScale: number, logger:ILogger) {
        this._logger = logger;
        this._version = 0n; // we start at version 1 because there is already the LedgerCreatedStateEvent
        this._lastSnapshotVersion = 0n;
        this._accounts = [];
        this._uncommittedEvents = [];
        this._transactionCount = 0n;

        this._id = id;
        this._assetScale = assetScale;
        // this._esRepo = esRepo;
    }

    /**
     * Create a new ledger with the given id and asset scale, should be called only
     * as consequence of the CreateLedgerCmd command
     * @param id
     * @param assetScale
     * @param logger
     * @constructor
     */
    static CreateNewLedger(id: string, assetScale: number, logger:ILogger): Ledger {
        const ledger = new Ledger(id, assetScale, logger);
        ledger._version = 1n;
        return ledger;
    }

    /**
     * Create a new ledger with the given id and asset scale, to be loaced from events
     * @param id
     * @param assetScale
     * @param logger
     * @constructor
     */
    static GetUnloadedLedger(id: string, logger:ILogger): Ledger {
        const ledger = new Ledger(id, 0, logger);
        ledger._version = 0n;
        return ledger;
    }

    /*
    * getters
    * */

    get id(): string {
        return this._id;
    }

    get version(): bigint {
        return this._version;
    }

    get lastSnapshotVersion(): bigint {
        return this._lastSnapshotVersion;
    }

    get uncommittedEvents(): LedgerStateEvents[] {
        return this._uncommittedEvents;
    }

    get accountsCount(): number {
        return this._accounts.length;
    }

    get transactionsCount(): bigint {
        return this._transactionCount;
    }

    /*
    * private
    * */

    private _applySnapshot(snapshot: SnapshotEvent): void {
        if (snapshot.msgType !== MessageTypes.SNAPSHOT_EVENT || snapshot.msgName !== LedgerSnapshotEvent.name) {
            throw new Error("Invalid snapshot event type");
        }

        /*
        Note: when applying snapshots we don't care about applying the immediately
        next version event, but we do care about leaving the state in the correct version
        after the snapshot is applied.
        */

        const snapshotEvent = snapshot as LedgerSnapshotEvent;
        this._accounts = snapshotEvent.payload.accounts.map(LedgerAccountSerializer.fromDTO);
        this._lastSnapshotVersion = this._version = BigInt(snapshotEvent.aggregateVersion);
        this._transactionCount = BigInt(snapshotEvent.payload.transactionCount);

        // TODO only greater than current version, not equal
        if (this._version !== BigInt(snapshot.aggregateVersion)) {
            throw new Error("Version mismatch");
        }
    }

    private _applyEvent(event: StateEvent, replayed: boolean = false) {
        if (event.msgType !== MessageTypes.STATE_EVENT) throw new Error("Invalid event type");

        if (BigInt(event.aggregateVersion) !== this._version + 1n) {
            if(replayed) return; // ignore older events if replaying
            throw new Error("Event version mismatch, cannot apply event out of order");
        }

        if (event.msgName === LedgerCreatedStateEvent.name) {
            this._applyLedgerCreatedStateEvent(event as LedgerCreatedStateEvent);
        }else if (event.msgName === LedgerAccountCreatedStateEvent.name) {
            this._applyLedgerAccountCreatedStateEvent(event as LedgerAccountCreatedStateEvent);
        } else if (event.msgName === LedgerTransactionRecordedStateEvent.name) {
            this._applyLedgerTransactionRecordedStateEvent(event as LedgerTransactionRecordedStateEvent);
        } else {
            throw new Error("Invalid event type");
        }

        // increment version or set to last event, if replaying
        this._version = replayed ? BigInt(event.aggregateVersion) : this._version + 1n;
        // this._version++;
    }

    private _applyLedgerCreatedStateEvent(event: LedgerCreatedStateEvent): void {
        this._assetScale = event.payload.assetScale;
    }

    private _applyLedgerAccountCreatedStateEvent(event: LedgerAccountCreatedStateEvent): void {
        const existingAccount = this._accounts.find(a => a.id === event.payload.account.id);
        if (existingAccount) {
            throw new Error("Account with that ID already exists, cannot apply event");
        }
        this._accounts.push(LedgerAccountSerializer.fromDTO(event.payload.account));
    }

    private _applyLedgerTransactionRecordedStateEvent(event: LedgerTransactionRecordedStateEvent): void {
        const drAccount = this._accounts.find(a => a.id === event.payload.transaction.debitedAccountId);
        const crAccount = this._accounts.find(a => a.id === event.payload.transaction.creditedAccountId);
        if (!drAccount || !crAccount) {
            throw new Error("Accounts not found");
        }
        const amount = BigInt(event.payload.transaction.amount);
        drAccount.debitedAmount += amount;
        crAccount.creditedAmount += amount;

        this._transactionCount++;
    }

    private _recordStateEvents(events: StateEvent[]): void {
        events.forEach(event => {
            this._version++;
            event.aggregateVersion = this._version.toString();
            this._uncommittedEvents.push(event);
        });
    }

    private async _processCreateLedgerAccountCmd(cmd: CreateLedgerAccountCmd): Promise<void> {
        if(cmd.payload.assetCode !== this._id){
            throw new Error("Asset code does not match ledger's");
        }

        const existingAccount = this._accounts.find(a => a.id === cmd.payload.id);
        if (existingAccount) {
            throw new Error("Account with that ID already exists");
        }

        const acc: ILedgerAccount ={
            id: cmd.payload.id,
            name: cmd.payload.name,
            assetCode: cmd.payload.assetCode,
            assetDisplayScale: cmd.payload.assetDisplayScale,
            debitedAmount: 0n,
            creditedAmount: 0n
        }

        this._accounts.push(acc);

        this._recordStateEvents([
            new LedgerAccountCreatedStateEvent(
                this._id, this._version.toString(),
                {account: LedgerAccountSerializer.toDTO(acc)}
            )
        ]);
    }

    private async _processPostTransactionCmd(cmd: PostTransactionCmd): Promise<void> {
        const debitedAccount: ILedgerAccount | undefined = this._accounts.find(a => a.id === cmd.payload.debitedAccountId);
        const creditedAccount = this._accounts.find(a => a.id === cmd.payload.creditedAccountId);
        if (!debitedAccount || !creditedAccount) {
            throw new Error("Account(s) not found");
        }
        if (debitedAccount.assetCode !== creditedAccount.assetCode || debitedAccount.assetCode !== this._id) {
            throw new Error("Account(s) not of same asset or not the ledger's asset");
        }

        const transaction: ILedgerTransaction = {
            id: cmd.payload.id,
            debitedAccountId: cmd.payload.debitedAccountId,
            creditedAccountId: cmd.payload.creditedAccountId,
            amount: BigInt(cmd.payload.amount),
            amountScale: cmd.payload.amountScale,
            timestamp: Date.now(),
        }

        // TODO validate amount and convert to ledger scale

        debitedAccount.debitedAmount += transaction.amount;
        creditedAccount.creditedAmount += transaction.amount;

        this._transactionCount++;

        this._recordStateEvents([
            new LedgerTransactionRecordedStateEvent(
                this._id,
                this._version.toString(),
                { transaction: TransactionSerializer.toDTO(transaction) }
            )
        ]);
    }

    /*
    * public
    * */

    async load(snapshot:SnapshotEvent | null, events:StateEvent[], replayed: boolean = false): Promise<boolean> {
        if(!snapshot && !events.length){
            return false;
        }

        if (snapshot) {
            this._applySnapshot(snapshot);
        }
        if (!events.length) {
            // return true/ok if no events found but a snapshot exists
            return !!snapshot;
        }

        for (const event of events) {
            this._applyEvent(event, replayed);
        }

        if (this._version !== BigInt(events[events.length - 1].aggregateVersion)) {
            throw new Error("Version mismatch");
        }

        this._logger.debug(`Ledger ${this.id} - loaded from ${snapshot ? "one snapshot and" :""} ${events.length} event(s) at version: ${this.version}, last snapshot version: ${this.lastSnapshotVersion}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`);
        return true;
    }

    async processCommand(cmd: CommandMsg): Promise<void> {
        if(cmd.msgType !== MessageTypes.COMMAND){
            throw new Error(`invalid command msgType: '${cmd.msgType}' in processCommand()`);
        }

        if(cmd.msgName === CreateLedgerAccountCmd.name) {
            await this._processCreateLedgerAccountCmd(cmd as CreateLedgerAccountCmd);
        }else if(cmd.msgName === PostTransactionCmd.name) {
            await this._processPostTransactionCmd(cmd as PostTransactionCmd);
        }else{
            throw new Error(`unhandled command with msgName: '${cmd.msgName}'`);
        }

        //this._logger.debug(`Ledger ${this.id} - processed command: ${cmd.msgName}`);
    }

    snapshot(lastEventIndex?: {partition: number, offset: number}): LedgerSnapshotEvent {
        this._lastSnapshotVersion = this._version;

        const snapshotPayload: LedgerSnapshotPayload = {
            assetScale: this._assetScale,
            accounts: this._accounts.map(LedgerAccountSerializer.toDTO),
            transactionCount: this._transactionCount.toString()
        };

        const retEvent = new LedgerSnapshotEvent(this.id, this._version.toString(), snapshotPayload);
        if(lastEventIndex) {
            retEvent.lastEventIndexPartition = lastEventIndex.partition;
            retEvent.lastEventIndexOffset = lastEventIndex.offset;
        }

        return retEvent;
    }

    clearUncommittedEvents(): void {
        this._uncommittedEvents.length = 0;
    }

    getAccounts(ids: string[]): ReadonlyArray<ILedgerAccount> {
        return this._accounts.filter(a => ids.includes(a.id)) as ReadonlyArray<ILedgerAccount>;
    }

    printStats() {
        const header = "LEDGER STATE " + "-".repeat(20);
        const footer = "-".repeat(header.length);

        let output = `Version:               ${this._version}\n`
        output += `Last snapshot version: ${this._lastSnapshotVersion}\n`;
        output += `Accounts:              ${this._accounts.length}\n`;
        output += `Transactions:          ${this._transactionCount}`

        console.log(`${header}\n${output}\n${footer}\n`);
    }
}
