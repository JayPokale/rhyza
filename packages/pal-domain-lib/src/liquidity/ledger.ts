/*****
 Contributors

 * Interledger Foundation
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>

 --------------
 ******/

"use strict";

import {ILedgerAccount, LedgerAccountDtoSerializer} from "./entities/ledger-account";
import {ILedgerTransaction, LedgerTransactionDtoSerializer} from "./entities/transaction";
import {
  LedgerAccountCreatedStateEvent, LedgerCreatedStateEvent,
  LedgerSnapshotEvent, LedgerSnapshotPayload, LedgerStateEvent,
  LedgerTransactionRecordedStateEvent,
} from "./messages/events";
import {
  CheckBalanceAndReserveTransferCmd, CommitTransferCmd,
  CreateLedgerAccountCmd, LedgerCommand,
  PostTransactionCmd, RejectTransferCmd, ReserveTransferCmd
} from "./messages/commands";
import * as console from "node:console";
import {ILogger, MessageTypes, } from "common-types-lib";
import {InsufficientFundsError} from "./errors";
import {
  LedgerDomainEvent, LegerAccountCreatedEvent, LegerTransactionPostedEvent,
  LegerTransferCommitedEvent,
  LegerTransferInsufficientFundsErrorEvent, LegerTransferRejectedEvent, LegerTransferReservedEvent,
} from "pal-public-types-lib";
import {ILedger} from "./entities/ledger";

export class Ledger implements ILedger {
    private readonly _id: string;   // ledger id is the asset code
    private readonly _logger:ILogger;
    private _version: bigint;
    private _assetScale: number;
    private _accounts: ILedgerAccount[];
    private _transactionCount: bigint;
    private _lastSnapshotVersion: bigint;

    private readonly _uncommittedStateEvents: LedgerStateEvent[];
    private readonly _uncommittedDomainEvents: LedgerDomainEvent[];

    //private _esRepo: IEventSourcingRepository;

    private constructor(id: string, assetScale: number, logger:ILogger) {
        this._logger = logger;
        this._version = 0n; // we start at version 1 because there is already the LedgerCreatedStateEvent
        this._lastSnapshotVersion = 0n;
        this._accounts = [];
        this._uncommittedStateEvents = [];
        this._uncommittedDomainEvents = [];
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

    get assetScale(): number {
        return this._assetScale;
    }

    get lastSnapshotVersion(): bigint {
        return this._lastSnapshotVersion;
    }

    get uncommittedStateEvents(): LedgerStateEvent[] {
        return this._uncommittedStateEvents;
    }

    get uncommittedDomainEvents(): LedgerDomainEvent[] {
        return this._uncommittedDomainEvents;
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

    private _checkLiquidity(clearingAcc: ILedgerAccount, liquidityAcc: ILedgerAccount, amount:bigint): boolean{
      return (clearingAcc.creditedAmount - clearingAcc.debitedAmount) + (liquidityAcc.creditedAmount - liquidityAcc.debitedAmount) >= amount;
    }

    private _recordStateEvents(events: LedgerStateEvent[]): void {
      events.forEach(event => {
        this._version++;
        event.aggregateVersion = this._version.toString();
        this._uncommittedStateEvents.push(event);
      });
    }

    private _postTransaction(debitedAccount: ILedgerAccount, creditedAccount: ILedgerAccount, transaction:ILedgerTransaction):void{
      debitedAccount.debitedAmount += transaction.amount;
      creditedAccount.creditedAmount += transaction.amount;

      this._transactionCount++;

      this._recordStateEvents([
        new LedgerTransactionRecordedStateEvent(
          this._id,
          this._version.toString(),
          { transaction: LedgerTransactionDtoSerializer.toDTO(transaction) }
        )
      ]);
    }

    private _applySnapshot(snapshot: LedgerSnapshotEvent): void {
        if (snapshot.msgType !== MessageTypes.SNAPSHOT_EVENT || snapshot.msgName !== LedgerSnapshotEvent.name) {
            throw new Error("Invalid snapshot event type");
        }

        /*
        Note: when applying snapshots we don't care about applying the immediately
        next version event, but we do care about leaving the state in the correct version
        after the snapshot is applied.
        */

        this._accounts = snapshot.payload.accounts.map(LedgerAccountDtoSerializer.fromDTO);
        this._lastSnapshotVersion = this._version = BigInt(snapshot.aggregateVersion);
        this._transactionCount = BigInt(snapshot.payload.transactionCount);

        // TODO only greater than current version, not equal
        if (this._version !== BigInt(snapshot.aggregateVersion)) {
            throw new Error("Version mismatch");
        }
        this._logger.debug(`Ledger ${this.id} - loaded from snapshot at version: ${this.version}, last snapshot version: ${this.lastSnapshotVersion}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`);
    }

    private _applyEvent(event: LedgerStateEvent, replayed: boolean = false): void {
        if (event.msgType !== MessageTypes.STATE_EVENT) throw new Error("Invalid event type");

        if (BigInt(event.aggregateVersion) !== this._version + 1n) {
            if(replayed) return; // ignore older events if replaying
            throw new Error("Event version mismatch, cannot apply event out of order");
        }

        if (LedgerStateEvent.isLedgerCreatedStateEvent(event)) {
            this._applyLedgerCreatedStateEvent(event);
        }else if (LedgerStateEvent.isLedgerAccountCreatedStateEvent(event)) {
            this._applyLedgerAccountCreatedStateEvent(event);
        } else if (LedgerStateEvent.isLedgerTransactionRecordedStateEvent(event)) {
            this._applyLedgerTransactionRecordedStateEvent(event);
        } else {
            throw new Error("Invalid event type");
        }

        // increment version or set to last event, if replaying
        this._version = replayed ? BigInt(event.aggregateVersion) : this._version + 1n;
    }

    private _applyLedgerCreatedStateEvent(event: LedgerCreatedStateEvent): void {
        this._assetScale = event.payload.assetScale;
    }

    private _applyLedgerAccountCreatedStateEvent(event: LedgerAccountCreatedStateEvent): void {
        const existingAccount = this._accounts.find(a => a.id === event.payload.account.id);
        if (existingAccount) {
            throw new Error("Account with that ID already exists, cannot apply event");
        }
        this._accounts.push(LedgerAccountDtoSerializer.fromDTO(event.payload.account));
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
                {account: LedgerAccountDtoSerializer.toDTO(acc)}
            )
        ]);

      this._uncommittedDomainEvents.push(new LegerAccountCreatedEvent(
        this._id,
        {
          id: acc.id,
          name: acc.name,
          assetCode: acc.assetCode,
          assetDisplayScale: acc.assetDisplayScale
        }
      ));
    }

    private async _processPostTransactionCmd(cmd: PostTransactionCmd): Promise<void> {
        const debitedAccount: ILedgerAccount | undefined = this._accounts.find(a => a.id === cmd.payload.debitedAccountId);
        const creditedAccount = this._accounts.find(a => a.id === cmd.payload.creditedAccountId);
        if (!debitedAccount || !creditedAccount) {
            throw new Error("Account(s) not found");
        }
        // note: we don't need to check that the accounts are of the same asset in the same ledger!

        const transaction: ILedgerTransaction = {
            id: cmd.payload.id,
            debitedAccountId: cmd.payload.debitedAccountId,
            creditedAccountId: cmd.payload.creditedAccountId,
            amount: BigInt(cmd.payload.amount),
            amountScale: cmd.payload.amountScale,
            timestamp: Date.now(),
        }

        // TODO validate amount and convert to ledger scale


        this._postTransaction(debitedAccount, creditedAccount, transaction);

        this._uncommittedDomainEvents.push(
          new LegerTransactionPostedEvent(
            this._id,
            {
              id: transaction.id,
              debitedAccountId: transaction.debitedAccountId,
              creditedAccountId: transaction.creditedAccountId,
              amount: transaction.amount.toString(),
              amountScale: transaction.amountScale,
              timestamp: transaction.timestamp,
            }
          )
        );
    }

    private async _processReserveTransferCmd(cmd:ReserveTransferCmd): Promise<void> {
    const payerClearingAccount: ILedgerAccount | undefined = this._accounts.find(a => a.id === cmd.payload.payerClearingAccountId);
    const suspenseAccount = this._accounts.find(a => a.id === cmd.payload.suspenseAccountId);
    if (!payerClearingAccount || !suspenseAccount) {
      throw new Error("Account(s) not found");
    }
    // note: we don't need to check that the accounts are of the same asset in the same ledger!

    const amount = BigInt(cmd.payload.amount);

    // TODO validate amount and convert to ledger scale

    this._postTransaction(payerClearingAccount, suspenseAccount, {
      id: cmd.payload.transactionId,
      debitedAccountId: cmd.payload.payerClearingAccountId,
      creditedAccountId: cmd.payload.suspenseAccountId,
      amount: amount,
      amountScale: cmd.payload.amountScale,
      timestamp: Date.now(),
      externalId: cmd.payload.transactionId,
    });

    this._uncommittedDomainEvents.push(
      new LegerTransferReservedEvent(
        this._id,
        {
          requestId: cmd.payload.requestId,
          transactionId: cmd.payload.transactionId,
          isError: false
        }
      )
    );
  }

    private async _processCheckBalanceAndReserveCmd(cmd:CheckBalanceAndReserveTransferCmd): Promise<void> {
      const payerClearingAccount: ILedgerAccount | undefined = this._accounts.find(a => a.id === cmd.payload.payerClearingAccountId);
      const payerLiquidityAccount = this._accounts.find(a => a.id === cmd.payload.payerLiquidityAccountId);
      const suspenseAccount = this._accounts.find(a => a.id === cmd.payload.suspenseAccountId);
      if (!payerClearingAccount || !payerLiquidityAccount || !suspenseAccount) {
        throw new Error("Account(s) not found");
      }
      // note: we don't need to check that the accounts are of the same asset in the same ledger!

      const amount = BigInt(cmd.payload.amount);

      // check liquidity
      const hasLiquidity = this._checkLiquidity(payerClearingAccount, payerLiquidityAccount, amount);

      if(!hasLiquidity) {
        this._logger.warn(`Ledger ${this._id} - check balance and reserve transfer failed, insufficient liquidity`);
        this._uncommittedDomainEvents.push(
          new LegerTransferInsufficientFundsErrorEvent(
            this._id, cmd.payload.requestId, cmd.payload.transactionId,
          )
        );
        return;
      }

      // TODO validate amount and convert to ledger scale

      this._postTransaction(payerClearingAccount, suspenseAccount, {
        id: cmd.payload.transactionId,
        debitedAccountId: cmd.payload.payerClearingAccountId,
        creditedAccountId: cmd.payload.suspenseAccountId,
        amount: amount,
        amountScale: cmd.payload.amountScale,
        timestamp: Date.now(),
        externalId: cmd.payload.transactionId,
      });

      this._uncommittedDomainEvents.push(
        new LegerTransferReservedEvent(
          this._id,
          {
            requestId: cmd.payload.requestId,
            transactionId: cmd.payload.transactionId,
            isError: false
          }
        )
      );
    }

    private async _processCommitTransferCmd(cmd:CommitTransferCmd): Promise<void> {
      const suspenseAccount = this._accounts.find(a => a.id === cmd.payload.suspenseAccountId);
      const payerClearingAccount: ILedgerAccount | undefined = this._accounts.find(a => a.id === cmd.payload.payerClearingAccountId);
      const payeeClearingAccount = this._accounts.find(a => a.id === cmd.payload.payeeClearingAccountId);
      if (!payerClearingAccount || !payeeClearingAccount || !suspenseAccount) {
        throw new Error("Account(s) not found");
      }

      const amount = BigInt(cmd.payload.amount);
      const now = Date.now();

      this._postTransaction(suspenseAccount, payerClearingAccount, {
        id: cmd.payload.transactionId,
        debitedAccountId: cmd.payload.suspenseAccountId,
        creditedAccountId: cmd.payload.payerClearingAccountId,
        amount: amount,
        amountScale: cmd.payload.amountScale,
        timestamp: now,
        externalId: cmd.payload.transactionId
      })

      this._postTransaction(payerClearingAccount, payeeClearingAccount, {
        id: cmd.payload.transactionId,
        debitedAccountId: cmd.payload.payerClearingAccountId,
        creditedAccountId: cmd.payload.payeeClearingAccountId,
        amount: amount,
        amountScale: cmd.payload.amountScale,
        timestamp: now,
        externalId: cmd.payload.transactionId,
      });

      this._uncommittedDomainEvents.push(
        new LegerTransferCommitedEvent(
          this._id,
          {
            requestId: cmd.payload.requestId,
            transactionId: cmd.payload.transactionId,
            isError: false
          }
        )
      );
    }

    private async _processRejectTransferCmd(cmd:RejectTransferCmd): Promise<void> {
      const suspenseAccount = this._accounts.find(a => a.id === cmd.payload.suspenseAccountId);
      const payerClearingAccount: ILedgerAccount | undefined = this._accounts.find(a => a.id === cmd.payload.payerClearingAccountId);
      if (!payerClearingAccount || !suspenseAccount) {
        throw new Error("Account(s) not found");
      }

      this._postTransaction(suspenseAccount, payerClearingAccount, {
        id: cmd.payload.transactionId,
        debitedAccountId: cmd.payload.suspenseAccountId,
        creditedAccountId: cmd.payload.payerClearingAccountId,
        amount: BigInt(cmd.payload.amount),
        amountScale: cmd.payload.amountScale,
        timestamp: Date.now(),
        externalId: cmd.payload.transactionId
      });

      this._uncommittedDomainEvents.push(
        new LegerTransferRejectedEvent(
          this._id,
          {
            requestId: cmd.payload.requestId,
            transactionId: cmd.payload.transactionId,
            isError: false
          }
        )
      );
    }

    /*
    * public
    * */

    // load the aggregate from the snapshot and events
    async load(snapshot:LedgerSnapshotEvent | null, events:LedgerStateEvent[], replayed: boolean = false): Promise<boolean> {
        this._logger.debug(`Ledger ${this.id} at version ${this._version} - going to load from ${snapshot ? "1" : "(no)"} snapshot and ${events.length} events - replayed: ${replayed} ...`);

        if(!snapshot && !events.length){
            return false;
        }

        if (snapshot) {
            this._applySnapshot(snapshot);
        }
        if (!events.length) {
            // return true/ok if no events found but a snapshot exists
            if(snapshot){
              this._logger.debug(`Ledger ${this.id} - loaded from snapshot at version: ${this.version}, last snapshot version: ${this.lastSnapshotVersion}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`);
              return true;
            }
            this._logger.warn(`Ledger ${this.id} - not loaded - no snapshots or events provided`);
            return false;
        }

        await this.applyEvents(events, replayed);
        return true;
    }

    async applyEvents(events:LedgerStateEvent[], replayed: boolean): Promise<void> {
      // if replaying and last event is older than the current version, ignore it
      if(replayed && this._version > BigInt(events[events.length - 1].aggregateVersion)) {
        this._logger.debug(`Ledger ${this.id} - ignoring older events when replaying, last has version ${events[events.length - 1].aggregateVersion} and ledger is at version ${this._version}`);
        return;
      }

      for (const event of events) {
        this._applyEvent(event, replayed);
      }

      if (this._version !== BigInt(events[events.length - 1].aggregateVersion)) {
        throw new Error("Version mismatch");
      }

      this._logger.debug(`Ledger ${this.id} - applied ${events.length} event(s), current version is: ${this.version}, last snapshot version: ${this.lastSnapshotVersion}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`);
      return;
    }


  async processCommand(ledgerCmd: LedgerCommand): Promise<void> {
        if(LedgerCommand.isCreateLedgerAccountCmd(ledgerCmd)) {
            await this._processCreateLedgerAccountCmd(ledgerCmd);
        }else if(LedgerCommand.isPostTransactionCmd(ledgerCmd)) {
            await this._processPostTransactionCmd(ledgerCmd);
        }else if(LedgerCommand.isReserveTransferCmd(ledgerCmd)) {
          await this._processReserveTransferCmd(ledgerCmd);
        }else if(LedgerCommand.isCheckBalanceAndReserveTransferCmd(ledgerCmd)) {
          await this._processCheckBalanceAndReserveCmd(ledgerCmd);
        }else if(LedgerCommand.isCommitTransferCmd(ledgerCmd)) {
          await this._processCommitTransferCmd(ledgerCmd);
        }else if(LedgerCommand.isRejectTransferCmd(ledgerCmd)) {
          await this._processRejectTransferCmd(ledgerCmd);
        }else{
            throw new Error(`unhandled command with msgName: '${ledgerCmd.msgName}'`);
        }

        //this._logger.debug(`Ledger ${this.id} - processed command: ${cmd.msgName}`);
    }

    executeSnapshot(lastEventIndex?: {partition: number, offset: number}): LedgerSnapshotEvent {
        this._lastSnapshotVersion = this._version;

        const snapshotPayload: LedgerSnapshotPayload = {
            assetScale: this._assetScale,
            accounts: this._accounts.map(LedgerAccountDtoSerializer.toDTO),
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
        this._uncommittedStateEvents.length = 0;
    }

    clearUncommittedDomainEvents(): void {
        this._uncommittedDomainEvents.length = 0;
    }

    getAccounts(ids: string[]): ReadonlyArray<ILedgerAccount> {
      const list: ILedgerAccount[] = [];
      // not ideal but keeps the order of the ids
      ids.forEach(id => {
        const account = this._accounts.find(a => a.id === id);
        if(account) {
          list.push(account);
        }
      });
      return list as ReadonlyArray<ILedgerAccount>;
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

    verify(): boolean {
      let totalDebited = 0n;
      let totalCredited = 0n;
      this._accounts.forEach(account => {
        totalDebited += account.debitedAmount;
        totalCredited += account.creditedAmount;
      });

      return totalDebited == totalCredited;
    }
}
