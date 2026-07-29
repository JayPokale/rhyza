import {
  ILedgerAccount,
  LedgerAccountDtoSerializer,
  LedgerAccountTypes
} from './ledger-account';
import {
  LedgerAccountsCreatedStateEvent,
  LedgerCreatedStateEvent,
  LedgerSnapshotEvent,
  LedgerStateEvent,
  LedgerTransactionRecordedStateEvent
} from '../messages/events';
import {
  CheckBalanceAndReserveTransferCmd,
  CommitTransferCmd,
  CreateLedgerAccountForAssetCmd,
  CreateLedgerAccountsForPeerCmd,
  DepositToAseCmd,
  DepositToPeerCmd,
  LedgerCommand,
  PostTransactionCmd,
  RejectTransferCmd,
  ReserveTransferCmd,
  WithdrawFromAseCmd,
  WithdrawFromPeerCmd
} from '../messages/commands';
import { CommandMsg, ILogger, MessageTypes } from 'common-types-lib';
import {
  LedgerDomainEvent,
  LedgerTransactionPostedEvent,
  LedgerOutgoingTransferCommittedEvent,
  LedgerOutgoingTransferRejectedEvent,
  LedgerOutgoingTransferReservedEvent,
  LedgerOutgoingTransferInsufficientFundsErrorEvent,
  ILedgerTransactionDto,
  LedgerAccountCreatedForAssetEvent,
  LedgerAccountCreationForAssetFailedEvent,
  LedgerAccountCreationForPeerFailedEvent,
  LedgerAccountsCreatedForPeerEvent,
  ILedgerDto,
  LedgerIncomingTransferReservedEvent,
  LedgerIncomingTransferCommittedEvent,
  LedgerIncomingTransferRejectedEvent,
  LedgerIncomingTransferInsufficientFundsErrorEvent,
  LedgerOutgoingTransferCheckBalanceAndReserveFailedEvent,
  LedgerOutgoingTransferReserveFailedEvent,
  LedgerHighLevelFailureResponseEventPayload,
  LedgerIncomingTransferReserveFailedEvent,
  LedgerIncomingTransferCheckBalanceAndReserveFailedEvent,
  LedgerHighLevelSuccessResponseEventPayload,
  LedgerOutgoingTransferCommitFailedEvent,
  LedgerOutgoingTransferRejectFailedEvent,
  LedgerIncomingTransferCommitFailedEvent,
  LedgerIncomingTransferRejectFailedEvent,
  LedgerHighLevelSuccessResponseEvent,
  LedgerHighLevelFailureResponseEvent,
  LedgerDepositToPeerFailedEvent,
  LedgerWithdrawFromPeerFailedEvent,
  LedgerLiquidityManagementSuccessEventPayload,
  LedgerLiquidityManagementFailureEventPayload,
  LedgerDepositToAseFailedEvent,
  LedgerDepositToPeerSucceededEvent,
  LedgerDepositToAseSucceededEvent,
  LedgerWithdrawFromAseFailedEvent,
  LedgerWithdrawFromPeerSucceededEvent,
  LedgerWithdrawFromAseSucceededEvent,
  LedgerWithdrawFromPeerFailedWithInsufficientFundsEvent,
  LedgerWithdrawFromAseFailedWithInsufficientFundsEvent
} from 'pal-public-types-lib';
import {amountToBigIntOfSize, amountFromBigIntOfSize} from "../utils";

const DEFAULT_DISPLAY_ASSET_SCALE = 2;

export class Ledger {
  private readonly _id: string; // ledger id is the asset code
  private readonly _logger: ILogger;
  private _version: bigint;
  private _assetScale: number;
  private _accounts: ILedgerAccount[];
  private _transactionCount: bigint;
  private _lastSnapshotVersion: bigint;

  private readonly _uncommittedStateEvents: LedgerStateEvent[];
  private readonly _uncommittedDomainEvents: LedgerDomainEvent[];

  private constructor(id: string, assetScale: number, logger: ILogger) {
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
  static CreateNewLedger(
    id: string,
    assetScale: number,
    logger: ILogger
  ): Ledger {
    const ledger = new Ledger(id, assetScale, logger);
    ledger._version = 1n;
    return ledger;
  }

  /**
   * Create a new ledger with the given id and asset scale, to be loaded from events
   * @param id
   * @param logger
   * @constructor
   */
  static GetUnloadedLedger(id: string, logger: ILogger): Ledger {
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

  private _recordAndApplyStateEvent(event: LedgerStateEvent): void {
    // event version must be resulting agg version (after evt apply
    event.aggregateVersion = (this._version + 1n).toString();
    this._uncommittedStateEvents.push(event);
    this._applyEvent(event);
  }

  private _recordDomainEvent(
    event: LedgerDomainEvent,
    sourceCmd?: CommandMsg
  ): void {
    // propagate requestId
    if (sourceCmd?.requestId) {
      event.requestId = sourceCmd.requestId;
    }
    this._uncommittedDomainEvents.push(event);
  }



  /*
   * Apply events and snapshot
   * */

  private _applySnapshot(snapshot: LedgerSnapshotEvent): void {
    if (
      snapshot.msgType !== MessageTypes.SNAPSHOT_EVENT ||
      snapshot.msgName !== LedgerSnapshotEvent.name
    ) {
      throw new Error('Invalid snapshot event type');
    }

    /*
    Note: when applying snapshots, we don't care about applying the immediately
    next version event, but we do care about leaving the state in the correct version
    after the snapshot is applied.
    */

    // We can only apply a snapshot that is posterior to the current state
    if (this._version >= BigInt(snapshot.aggregateVersion)) {
      throw new Error(
        'Version mismatch - cannot apply snapshot with version that is older than current state version'
      );
    }

    this._accounts = snapshot.payload.accounts.map(
      LedgerAccountDtoSerializer.fromDTO
    );
    this._lastSnapshotVersion = this._version = BigInt(
      snapshot.aggregateVersion
    );
    this._transactionCount = BigInt(snapshot.payload.transactionCount);

    this._logger.debug(
      `Ledger ${this.id} - loaded from snapshot at version: ${this.version}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`
    );
  }

  private _applyEvent(
    event: LedgerStateEvent,
    replayed: boolean = false
  ): void {
    if (event.msgType !== MessageTypes.STATE_EVENT)
      throw new Error('Invalid event type');

    if (BigInt(event.aggregateVersion) !== this._version + 1n) {
      if (replayed) return; // ignore older events if replaying
      throw new Error(
        'Event version mismatch, cannot apply event out of order'
      );
    }

    if (LedgerStateEvent.isLedgerCreatedStateEvent(event)) {
      this._applyLedgerCreatedStateEvent(event);
    } else if (LedgerStateEvent.isLedgerAccountsCreatedStateEvent(event)) {
      this._applyLedgerAccountsCreatedStateEvent(event);
    } else if (LedgerStateEvent.isLedgerTransactionRecordedStateEvent(event)) {
      this._applyLedgerTransactionRecordedStateEvent(event);
    } else {
      throw new Error('Invalid event type');
    }

    // aggregate version to event
    this._version = BigInt(event.aggregateVersion);
  }

  private _applyLedgerCreatedStateEvent(event: LedgerCreatedStateEvent): void {
    this._assetScale = event.payload.assetScale;
  }

  private _applyLedgerAccountsCreatedStateEvent(
    event: LedgerAccountsCreatedStateEvent
  ): void {
    const duplicateFound = event.payload.accounts.some((newAccount) => {
      this._accounts.some((acc) => acc.id === newAccount.id);
    });
    if (duplicateFound) {
      throw new Error(
        'Account with that ID already exists, cannot apply event'
      );
    }
    this._accounts.push(
      ...event.payload.accounts.map(LedgerAccountDtoSerializer.fromDTO)
    );
  }

  private _applyLedgerTransactionRecordedStateEvent(
    event: LedgerTransactionRecordedStateEvent
  ): void {
    const drAccount = this._accounts.find(
      (a) => a.id === event.payload.transaction.debitedAccountId
    );
    const crAccount = this._accounts.find(
      (a) => a.id === event.payload.transaction.creditedAccountId
    );
    if (!drAccount || !crAccount) {
      throw new Error('Accounts not found');
    }
    const amount = BigInt(event.payload.transaction.amount);
    drAccount.debitedAmount += amount;
    crAccount.creditedAmount += amount;

    this._transactionCount++;
  }

  private _getAccount(
    type: LedgerAccountTypes,
    peerId?: string
  ): ILedgerAccount | undefined {
    return this._accounts.find((a) => {
      return (
        a.type === type &&
        (type === 'ASSET_LIQUIDITY_ACCOUNT' || (peerId && a.peerId === peerId))
      );
    });
  }

  private _failHighLevelWithAccountsNotFound(
    cmd:
      | ReserveTransferCmd
      | CheckBalanceAndReserveTransferCmd
      | CommitTransferCmd
      | RejectTransferCmd
  ): void {
    const payload: LedgerHighLevelFailureResponseEventPayload = {
      requestId: cmd.requestId,
      transferId: cmd.payload.transferId,
      paymentIntentId: cmd.payload.paymentIntentId,
      paymentId: cmd.payload.paymentId,
      errorMessage: `Account(s) not found for ${cmd.msgName}`
    };

    const direction = cmd.payload.transferDirection;
    let eventType:
      | typeof LedgerHighLevelSuccessResponseEvent
      | typeof LedgerHighLevelFailureResponseEvent;

    if (LedgerCommand.isReserveTransferCmd(cmd)) {
      eventType =
        direction === 'OUTGOING'
          ? LedgerOutgoingTransferReserveFailedEvent
          : LedgerIncomingTransferReserveFailedEvent;
    } else if (LedgerCommand.isCommitTransferCmd(cmd)) {
      eventType =
        direction === 'OUTGOING'
          ? LedgerOutgoingTransferCommitFailedEvent
          : LedgerIncomingTransferCommitFailedEvent;
    } else if (LedgerCommand.isRejectTransferCmd(cmd)) {
      eventType =
        direction === 'OUTGOING'
          ? LedgerOutgoingTransferRejectFailedEvent
          : LedgerIncomingTransferRejectFailedEvent;
    } else if (LedgerCommand.isCheckBalanceAndReserveTransferCmd(cmd)) {
      eventType =
        direction === 'OUTGOING'
          ? LedgerOutgoingTransferCheckBalanceAndReserveFailedEvent
          : LedgerIncomingTransferCheckBalanceAndReserveFailedEvent;
    } else {
      const err = new Error(
        'could not get error event in ledger._failHighLevelWithAccountsNotFound()'
      );
      this._logger.error(err);
      throw err;
    }

    this._recordDomainEvent(new eventType(this._id, payload), cmd);
    this._logger.warn(`Account(s) not found for ${cmd.msgName}`);
  }

  /*
   * process commands
   * */

  private async _processCreateLedgerAccountForAssetCmd(
    cmd: CreateLedgerAccountForAssetCmd
  ): Promise<void> {
    if (cmd.payload.assetCode !== this._id) {
      this._recordDomainEvent(
        new LedgerAccountCreationForAssetFailedEvent({
          assetCode: cmd.payload.assetCode,
          reason: 'ASSET_CODE_MISMATCH'
        }),
        cmd
      );
      this._logger.warn(
        `Asset code: ${cmd.payload.assetCode} of new account with ID: ${cmd.payload.id} does not match ledger's ID: ${this._id}`
      );
      return;
    }

    const existingAccount = this._accounts.find((a) => a.id === cmd.payload.id);
    if (existingAccount) {
      this._recordDomainEvent(
        new LedgerAccountCreationForAssetFailedEvent({
          assetCode: cmd.payload.assetCode,
          reason: 'DUPLICATE_ACCOUNT_ID'
        }),
        cmd
      );
      this._logger.warn(
        `Account with ID: ${cmd.payload.id} already exists in ledger: ${this._id}`
      );
      return;
    }

    this._recordAndApplyStateEvent(
      new LedgerAccountsCreatedStateEvent(this._id, {
        accounts: [
          {
            id: cmd.payload.id,
            type: LedgerAccountTypes.ASSET_LIQUIDITY_ACCOUNT,
            name: `Asset Account for '${cmd.payload.assetCode}'`,
            assetCode: cmd.payload.assetCode,
            assetDisplayScale: DEFAULT_DISPLAY_ASSET_SCALE,
            debitedAmount: 0n.toString(),
            creditedAmount: 0n.toString(),
            peerId: undefined
          }
        ]
      })
    );

    this._recordDomainEvent(
      new LedgerAccountCreatedForAssetEvent(this._id, {
        id: cmd.payload.id,
        assetCode: cmd.payload.assetCode
      }),
      cmd
    );
  }

  private async _processCreateLedgerAccountsForPeerCmd(
    cmd: CreateLedgerAccountsForPeerCmd
  ): Promise<void> {
    if (cmd.payload.assetCode !== this._id) {
      this._recordDomainEvent(
        new LedgerAccountCreationForPeerFailedEvent({
          peerId: cmd.payload.peerId,
          assetCode: cmd.payload.assetCode,
          reason: 'ASSET_CODE_MISMATCH'
        }),
        cmd
      );
      this._logger.warn(
        `Asset code: ${cmd.payload.assetCode} of account creation comand for peer: ${cmd.payload.peerId} does not match ledger's ID: ${this._id}`
      );
      return;
    }

    const duplicateIdFound = this._accounts.some(
      (acc) =>
        acc.id === cmd.payload.peerLiquidityAccId ||
        acc.id === cmd.payload.peerClearingAccId ||
        acc.id === cmd.payload.aseLiquidityAccId ||
        acc.id === cmd.payload.aseClearingAccId ||
        acc.id === cmd.payload.suspenseAccId
    );

    if (duplicateIdFound) {
      this._recordDomainEvent(
        new LedgerAccountCreationForPeerFailedEvent({
          peerId: cmd.payload.peerId,
          assetCode: cmd.payload.assetCode,
          reason: 'DUPLICATE_ACCOUNT_ID'
        }),
        cmd
      );
      this._logger.warn(
        `Duplicate account id detected while processing CreateLedgerAccountsForPeerCmd for peerId: ${cmd.payload.peerId}`
      );
      return;
    }

    const duplicateForPeerIdFound = this._accounts.some(
      (acc) =>
        acc.peerId === cmd.payload.peerId &&
        acc.assetCode === cmd.payload.assetCode
    );
    if (duplicateForPeerIdFound) {
      this._recordDomainEvent(
        new LedgerAccountCreationForPeerFailedEvent({
          peerId: cmd.payload.peerId,
          assetCode: cmd.payload.assetCode,
          reason: 'DUPLICATE_ACCOUNT_ID'
        }),
        cmd
      );
      this._logger.warn(
        `Duplicate accounts detected for the same peer id and asset code while processing CreateLedgerAccountsForPeerCmd for peerId: ${cmd.payload.peerId} and asset code: ${cmd.payload.assetCode}`
      );
      return;
    }

    const commonStateEventObj = {
      assetCode: cmd.payload.assetCode,
      assetDisplayScale: DEFAULT_DISPLAY_ASSET_SCALE,
      peerId: cmd.payload.peerId,
      debitedAmount: 0n.toString(),
      creditedAmount: 0n.toString()
    };

    this._recordAndApplyStateEvent(
      new LedgerAccountsCreatedStateEvent(this._id, {
        accounts: [
          {
            id: cmd.payload.peerLiquidityAccId,
            type: LedgerAccountTypes.PEER_LIQUIDITY_ACCOUNT,
            name: `Peer Liquidity Account for peer '${cmd.payload.peerId}' and asset '${cmd.payload.assetCode}'`,
            ...commonStateEventObj
          },
          {
            id: cmd.payload.peerClearingAccId,
            type: LedgerAccountTypes.PEER_CLEARING_ACCOUNT,
            name: `Peer Clearing Account for peer '${cmd.payload.peerId}' and asset '${cmd.payload.assetCode}'`,
            ...commonStateEventObj
          },
          {
            id: cmd.payload.aseLiquidityAccId,
            type: LedgerAccountTypes.ASE_LIQUIDITY_ACCOUNT,
            name: `ASE Liquidity Account for peer '${cmd.payload.peerId}' and asset '${cmd.payload.assetCode}'`,
            ...commonStateEventObj
          },
          {
            id: cmd.payload.aseClearingAccId,
            type: LedgerAccountTypes.ASE_CLEARING_ACCOUNT,
            name: `ASE Clearing Account for peer '${cmd.payload.peerId}' and asset '${cmd.payload.assetCode}'`,
            ...commonStateEventObj
          },
          {
            id: cmd.payload.suspenseAccId,
            type: LedgerAccountTypes.SUSPENSE_ACCOUNT,
            name: `Peer Suspense Account for peer '${cmd.payload.peerId}' and asset '${cmd.payload.assetCode}'`,
            ...commonStateEventObj
          }
        ]
      })
    );

    const outputDomainEvent = new LedgerAccountsCreatedForPeerEvent(this._id, {
      peerId: cmd.payload.peerId,
      assetCode: cmd.payload.assetCode,
      peerLiquidityAccId: cmd.payload.peerLiquidityAccId,
      peerClearingAccId: cmd.payload.peerClearingAccId,
      aseLiquidityAccId: cmd.payload.aseLiquidityAccId,
      aseClearingAccId: cmd.payload.aseClearingAccId,
      suspenseAccId: cmd.payload.suspenseAccId
    });

    this._recordDomainEvent(outputDomainEvent, cmd);
  }

  private async _processPostTransactionCmd(
    cmd: PostTransactionCmd
  ): Promise<void> {
    const debitedAccount: ILedgerAccount | undefined = this._accounts.find(
      (a) => a.id === cmd.payload.debitedAccountId
    );
    const creditedAccount = this._accounts.find(
      (a) => a.id === cmd.payload.creditedAccountId
    );
    if (!debitedAccount || !creditedAccount) {
      throw new Error('Account(s) not found');
    }
    // note: we don't need to check that the accounts are of the same asset in the same ledger!

    // TODO validate amount and convert to ledger scale
    const ledgerAmount = amountToBigIntOfSize(
      cmd.payload.amount, cmd.payload.amountScale, this._assetScale
    );

    const transactionDTO: ILedgerTransactionDto = {
      id: cmd.payload.id,
      debitedAccountId: cmd.payload.debitedAccountId,
      creditedAccountId: cmd.payload.creditedAccountId,
      amount: cmd.payload.amount,
      amountScale: cmd.payload.amountScale,
      timestamp: Date.now(),
      externalId: cmd.payload.transferId
    };

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: transactionDTO
      })
    );

    this._recordDomainEvent(
      new LedgerTransactionPostedEvent(this._id, transactionDTO),
      cmd
    );
  }

  private async _processReserveTransferCmd(
    cmd: ReserveTransferCmd
  ): Promise<void> {
    const payerClearingAccount = this._getAccount(
      cmd.payload.transferDirection === 'OUTGOING'
        ? LedgerAccountTypes.ASE_CLEARING_ACCOUNT
        : LedgerAccountTypes.PEER_CLEARING_ACCOUNT,
      cmd.payload.peerId
    );
    const suspenseAccount: ILedgerAccount | undefined = this._getAccount(
      LedgerAccountTypes.SUSPENSE_ACCOUNT,
      cmd.payload.peerId
    );

    if (!payerClearingAccount || !suspenseAccount) {
      this._failHighLevelWithAccountsNotFound(cmd);
      return;
    }
    // note: we don't need to check that the accounts are of the same asset in the same ledger!

    // TODO validate amount and convert to ledger scale
    const transactionDTO: ILedgerTransactionDto = {
      id: crypto.randomUUID(),
      debitedAccountId: payerClearingAccount.id,
      creditedAccountId: suspenseAccount.id,
      amount: cmd.payload.amount,
      amountScale: cmd.payload.amountScale,
      timestamp: Date.now(),
      externalId: cmd.payload.transferId
    };

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: transactionDTO
      })
    );

    const successPayload: LedgerHighLevelSuccessResponseEventPayload = {
      requestId: cmd.payload.requestId,
      transferId: cmd.payload.transferId,
      paymentIntentId: cmd.payload.paymentIntentId,
      paymentId: cmd.payload.paymentId
    };
    if (cmd.payload.transferDirection === 'OUTGOING') {
      this._recordDomainEvent(
        new LedgerOutgoingTransferReservedEvent(this._id, successPayload),
        cmd
      );
    } else {
      this._recordDomainEvent(
        new LedgerIncomingTransferReservedEvent(this._id, successPayload),
        cmd
      );
    }
  }

  private async _processCheckBalanceAndReserveCmd(
    cmd: CheckBalanceAndReserveTransferCmd
  ): Promise<void> {
    const payerClearingAccount = this._getAccount(
      cmd.payload.transferDirection === 'OUTGOING'
        ? LedgerAccountTypes.ASE_CLEARING_ACCOUNT
        : LedgerAccountTypes.PEER_CLEARING_ACCOUNT,
      cmd.payload.peerId
    );
    const payerLiquidityAccount = this._getAccount(
      cmd.payload.transferDirection === 'OUTGOING'
        ? LedgerAccountTypes.ASE_LIQUIDITY_ACCOUNT
        : LedgerAccountTypes.PEER_LIQUIDITY_ACCOUNT,
      cmd.payload.peerId
    );
    const suspenseAccount: ILedgerAccount | undefined = this._getAccount(
      LedgerAccountTypes.SUSPENSE_ACCOUNT,
      cmd.payload.peerId
    );

    if (!payerClearingAccount || !payerLiquidityAccount || !suspenseAccount) {
      this._failHighLevelWithAccountsNotFound(cmd);
      return;
    }
    // note: we don't need to check that the accounts are of the same asset in the same ledger!

    const amount = BigInt(cmd.payload.amount);

    // check liquidity
    const clearingBalance =
      payerClearingAccount.creditedAmount - payerClearingAccount.debitedAmount;
    const liquidityBalance =
      payerLiquidityAccount.creditedAmount -
      payerLiquidityAccount.debitedAmount;
    const hasLiquidity = clearingBalance + liquidityBalance >= amount;

    if (!hasLiquidity) {
      this._logger.warn(
        `Ledger ${this._id} - check balance and reserve transfer failed, insufficient liquidity`
      );
      const failurePayload: LedgerHighLevelFailureResponseEventPayload = {
        requestId: cmd.payload.requestId,
        transferId: cmd.payload.transferId,
        paymentIntentId: cmd.payload.paymentIntentId,
        paymentId: cmd.payload.paymentId,
        errorMessage: 'Insufficient liquidity'
      };
      if (cmd.payload.transferDirection === 'OUTGOING') {
        this._uncommittedDomainEvents.push(
          new LedgerOutgoingTransferInsufficientFundsErrorEvent(
            this._id,
            failurePayload
          )
        );
      } else {
        this._uncommittedDomainEvents.push(
          new LedgerIncomingTransferInsufficientFundsErrorEvent(
            this._id,
            failurePayload
          )
        );
      }
      return;
    }

    // TODO validate amount and convert to ledger scale

    const transactionDTO: ILedgerTransactionDto = {
      id: crypto.randomUUID(),
      debitedAccountId: payerClearingAccount.id,
      creditedAccountId: suspenseAccount.id,
      amount: amount.toString(),
      amountScale: cmd.payload.amountScale,
      timestamp: Date.now(),
      externalId: cmd.payload.transferId
    };

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: transactionDTO
      })
    );

    const successPayload: LedgerHighLevelSuccessResponseEventPayload = {
      requestId: cmd.payload.requestId,
      transferId: cmd.payload.transferId,
      paymentIntentId: cmd.payload.paymentIntentId,
      paymentId: cmd.payload.paymentId
    };

    if (cmd.payload.transferDirection === 'OUTGOING') {
      this._recordDomainEvent(
        new LedgerOutgoingTransferReservedEvent(this._id, successPayload),
        cmd
      );
    } else {
      this._recordDomainEvent(
        new LedgerIncomingTransferReservedEvent(this._id, successPayload),
        cmd
      );
    }
  }

  private async _processCommitTransferCmd(
    cmd: CommitTransferCmd
  ): Promise<void> {
    const payerClearingAccount = this._getAccount(
      cmd.payload.transferDirection === 'OUTGOING'
        ? LedgerAccountTypes.ASE_CLEARING_ACCOUNT
        : LedgerAccountTypes.PEER_CLEARING_ACCOUNT,
      cmd.payload.peerId
    );
    const payeeClearingAccount = this._getAccount(
      cmd.payload.transferDirection === 'OUTGOING'
        ? LedgerAccountTypes.PEER_CLEARING_ACCOUNT
        : LedgerAccountTypes.ASE_CLEARING_ACCOUNT,
      cmd.payload.peerId
    );
    const suspenseAccount: ILedgerAccount | undefined = this._getAccount(
      LedgerAccountTypes.SUSPENSE_ACCOUNT,
      cmd.payload.peerId
    );

    if (!payerClearingAccount || !payeeClearingAccount || !suspenseAccount) {
      this._failHighLevelWithAccountsNotFound(cmd);
      return;
    }

    const now = Date.now();

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: {
          id: crypto.randomUUID(),
          debitedAccountId: suspenseAccount.id,
          creditedAccountId: payerClearingAccount.id,
          amount: cmd.payload.amount,
          amountScale: cmd.payload.amountScale,
          timestamp: now,
          externalId: cmd.payload.transferId
        }
      })
    );

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: {
          id: crypto.randomUUID(),
          debitedAccountId: payerClearingAccount.id,
          creditedAccountId: payeeClearingAccount.id,
          amount: cmd.payload.amount,
          amountScale: cmd.payload.amountScale,
          timestamp: now,
          externalId: cmd.payload.transferId
        }
      })
    );

    const successPayload: LedgerHighLevelSuccessResponseEventPayload = {
      requestId: cmd.payload.requestId,
      transferId: cmd.payload.transferId,
      paymentIntentId: cmd.payload.paymentIntentId,
      paymentId: cmd.payload.paymentId
    };

    if (cmd.payload.transferDirection === 'OUTGOING') {
      this._recordDomainEvent(
        new LedgerOutgoingTransferCommittedEvent(this._id, successPayload),
        cmd
      );
    } else {
      this._recordDomainEvent(
        new LedgerIncomingTransferCommittedEvent(this._id, successPayload),
        cmd
      );
    }
  }

  private async _processRejectTransferCmd(
    cmd: RejectTransferCmd
  ): Promise<void> {
    const payerClearingAccount = this._getAccount(
      cmd.payload.transferDirection === 'OUTGOING'
        ? LedgerAccountTypes.ASE_CLEARING_ACCOUNT
        : LedgerAccountTypes.PEER_CLEARING_ACCOUNT,
      cmd.payload.peerId
    );
    const suspenseAccount: ILedgerAccount | undefined = this._getAccount(
      LedgerAccountTypes.SUSPENSE_ACCOUNT,
      cmd.payload.peerId
    );

    if (!payerClearingAccount || !suspenseAccount) {
      this._failHighLevelWithAccountsNotFound(cmd);
      return;
    }

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: {
          id: crypto.randomUUID(),
          debitedAccountId: suspenseAccount.id,
          creditedAccountId: payerClearingAccount.id,
          amount: cmd.payload.amount,
          amountScale: cmd.payload.amountScale,
          timestamp: Date.now(),
          externalId: cmd.payload.transferId
        }
      })
    );

    const successPayload: LedgerHighLevelSuccessResponseEventPayload = {
      requestId: cmd.payload.requestId,
      transferId: cmd.payload.transferId,
      paymentIntentId: cmd.payload.paymentIntentId,
      paymentId: cmd.payload.paymentId
    };

    if (cmd.payload.transferDirection === 'OUTGOING') {
      this._recordDomainEvent(
        new LedgerOutgoingTransferRejectedEvent(this._id, successPayload),
        cmd
      );
    } else {
      this._recordDomainEvent(
        new LedgerIncomingTransferRejectedEvent(this._id, successPayload),
        cmd
      );
    }
  }

  private async _processDepositCmd(
    cmd: DepositToPeerCmd | DepositToAseCmd
  ): Promise<void> {
    const assetAccount = this._getAccount(
      LedgerAccountTypes.ASSET_LIQUIDITY_ACCOUNT
    );
    let liquidityAccount: ILedgerAccount | undefined;

    if (cmd.msgName === DepositToPeerCmd.name) {
      liquidityAccount = this._getAccount(
        LedgerAccountTypes.PEER_LIQUIDITY_ACCOUNT,
        cmd.payload.peerId
      );
    } else {
      liquidityAccount = this._getAccount(
        LedgerAccountTypes.ASE_LIQUIDITY_ACCOUNT,
        cmd.payload.peerId
      );
    }

    if (!assetAccount || !liquidityAccount) {
      const failPayload: LedgerLiquidityManagementFailureEventPayload = {
        peerId: cmd.payload.peerId,
        requestId: cmd.payload.requestId,
        errorMessage: `Account(s) not found for ${cmd.msgName}`
      };
      if (cmd.msgName === WithdrawFromPeerCmd.name) {
        this._recordDomainEvent(
          new LedgerDepositToPeerFailedEvent(this._id, failPayload),
          cmd
        );
      } else {
        this._recordDomainEvent(
          new LedgerDepositToAseFailedEvent(this._id, failPayload),
          cmd
        );
      }

      this._logger.warn(`Account(s) not found for ${cmd.msgName}`);
      return;
    }

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: {
          id: crypto.randomUUID(),
          debitedAccountId: assetAccount.id,
          creditedAccountId: liquidityAccount.id,
          amount: cmd.payload.amount,
          amountScale: cmd.payload.amountScale,
          timestamp: Date.now(),
          externalId: cmd.payload.externalId
        }
      })
    );

    const payload: LedgerLiquidityManagementSuccessEventPayload = {
      peerId: cmd.payload.peerId,
      requestId: cmd.payload.requestId,
      externalId: cmd.payload.externalId
    };
    if (cmd.msgName === DepositToPeerCmd.name) {
      this._recordDomainEvent(
        new LedgerDepositToPeerSucceededEvent(this._id, payload),
        cmd
      );
    } else {
      this._recordDomainEvent(
        new LedgerDepositToAseSucceededEvent(this._id, payload),
        cmd
      );
    }
  }

  private async _processWithdrawCmd(
    cmd: WithdrawFromPeerCmd | WithdrawFromAseCmd
  ): Promise<void> {
    const assetAccount = this._getAccount(
      LedgerAccountTypes.ASSET_LIQUIDITY_ACCOUNT
    );
    let liquidityAccount: ILedgerAccount | undefined;

    if (cmd.msgName === WithdrawFromPeerCmd.name) {
      liquidityAccount = this._getAccount(
        LedgerAccountTypes.PEER_LIQUIDITY_ACCOUNT,
        cmd.payload.peerId
      );
    } else {
      liquidityAccount = this._getAccount(
        LedgerAccountTypes.ASE_LIQUIDITY_ACCOUNT,
        cmd.payload.peerId
      );
    }

    if (!assetAccount || !liquidityAccount) {
      const failPayload: LedgerLiquidityManagementFailureEventPayload = {
        peerId: cmd.payload.peerId,
        requestId: cmd.payload.requestId,
        errorMessage: `Account(s) not found for ${cmd.msgName}`
      };
      if (cmd.msgName === WithdrawFromPeerCmd.name) {
        this._recordDomainEvent(
          new LedgerWithdrawFromPeerFailedEvent(this._id, failPayload),
          cmd
        );
      } else {
        this._recordDomainEvent(
          new LedgerWithdrawFromAseFailedEvent(this._id, failPayload),
          cmd
        );
      }

      this._logger.warn(`Account(s) not found for ${cmd.msgName}`);
      return;
    }

    // Check liquidity
    const amount = BigInt(cmd.payload.amount);
    const hasLiquidity =
      liquidityAccount.creditedAmount - liquidityAccount.debitedAmount >=
      amount;

    if (!hasLiquidity) {
      const failPayload: LedgerLiquidityManagementFailureEventPayload = {
        peerId: cmd.payload.peerId,
        requestId: cmd.payload.requestId,
        errorMessage: 'Insufficient liquidity'
      };
      if (cmd.msgName === WithdrawFromPeerCmd.name) {
        this._recordDomainEvent(
          new LedgerWithdrawFromPeerFailedWithInsufficientFundsEvent(
            this._id,
            failPayload
          ),
          cmd
        );
      } else {
        this._recordDomainEvent(
          new LedgerWithdrawFromAseFailedWithInsufficientFundsEvent(
            this._id,
            failPayload
          ),
          cmd
        );
      }

      this._logger.warn(
        `Ledger ${this._id} - withdraw failed, insufficient liquidity ${cmd.msgName}`
      );
      return;
    }

    this._recordAndApplyStateEvent(
      new LedgerTransactionRecordedStateEvent(this._id, {
        transaction: {
          id: crypto.randomUUID(),
          debitedAccountId: liquidityAccount.id,
          creditedAccountId: assetAccount.id,
          amount: cmd.payload.amount,
          amountScale: cmd.payload.amountScale,
          timestamp: Date.now(),
          externalId: cmd.payload.externalId
        }
      })
    );

    const payload: LedgerLiquidityManagementSuccessEventPayload = {
      peerId: cmd.payload.peerId,
      requestId: cmd.payload.requestId,
      externalId: cmd.payload.externalId
    };

    if (cmd.msgName === WithdrawFromPeerCmd.name) {
      this._recordDomainEvent(
        new LedgerWithdrawFromPeerSucceededEvent(this._id, payload),
        cmd
      );
    } else {
      this._recordDomainEvent(
        new LedgerWithdrawFromAseSucceededEvent(this._id, payload),
        cmd
      );
    }
  }

  /*
   * public
   * */

  // load the aggregate from the snapshot and events
  async load(
    snapshot: LedgerSnapshotEvent | null,
    events: LedgerStateEvent[],
    replayed: boolean = false
  ): Promise<boolean> {
    this._logger.debug(
      `Ledger ${this.id} at version ${this._version} - going to load from ${snapshot ? '1' : '(no)'} snapshot and ${events.length} events - replayed: ${replayed} ...`
    );

    if (!snapshot && !events.length) {
      return false;
    }

    if (snapshot) {
      this._applySnapshot(snapshot);
    }
    if (!events.length) {
      // return true/ok if no events found but a snapshot exists
      if (snapshot) {
        this._logger.debug(
          `Ledger ${this.id} - loaded from snapshot at version: ${this.version}, last snapshot version: ${this.lastSnapshotVersion}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`
        );
        return true;
      }
      this._logger.warn(
        `Ledger ${this.id} - not loaded - no snapshots or events provided`
      );
      return false;
    }

    this.applyEvents(events, replayed);
    return true;
  }

  applyEvents(events: LedgerStateEvent[], replayed: boolean): void {
    if (events.length <= 0) return;
    // if replaying and last event is older than the current version, ignore it
    if (
      replayed &&
      this._version > BigInt(events[events.length - 1].aggregateVersion)
    ) {
      this._logger.debug(
        `Ledger ${this.id} - ignoring older events when replaying, last has version ${events[events.length - 1].aggregateVersion} and ledger is at version ${this._version}`
      );
      return;
    }

    for (const event of events) {
      this._applyEvent(event, replayed);
    }

    // confirm the version of the last event matches the current version
    if (this._version !== BigInt(events[events.length - 1].aggregateVersion)) {
      throw new Error('Version mismatch');
    }

    this._logger.debug(
      `Ledger ${this.id} - applied ${events.length} event(s), current version is: ${this.version}, last snapshot version: ${this.lastSnapshotVersion}, accounts count: ${this.accountsCount}, transactions count: ${this.transactionsCount}`
    );
    return;
  }

  async processCommand(ledgerCmd: LedgerCommand): Promise<void> {
    if (LedgerCommand.isCreateLedgerAccountForAssetCmd(ledgerCmd)) {
      // low level
      await this._processCreateLedgerAccountForAssetCmd(ledgerCmd);
    } else if (LedgerCommand.isCreateLedgerAccountsForPeerCmd(ledgerCmd)) {
      await this._processCreateLedgerAccountsForPeerCmd(ledgerCmd);
    } else if (LedgerCommand.isPostTransactionCmd(ledgerCmd)) {
      await this._processPostTransactionCmd(ledgerCmd);
    } else if (LedgerCommand.isReserveTransferCmd(ledgerCmd)) {
      // high level
      await this._processReserveTransferCmd(ledgerCmd);
    } else if (LedgerCommand.isCheckBalanceAndReserveTransferCmd(ledgerCmd)) {
      await this._processCheckBalanceAndReserveCmd(ledgerCmd);
    } else if (LedgerCommand.isCommitTransferCmd(ledgerCmd)) {
      await this._processCommitTransferCmd(ledgerCmd);
    } else if (LedgerCommand.isRejectTransferCmd(ledgerCmd)) {
      await this._processRejectTransferCmd(ledgerCmd);
    } else if (
      LedgerCommand.isDepositToPeerCmd(ledgerCmd) ||
      LedgerCommand.isDepositToAseCmd(ledgerCmd)
    ) {
      await this._processDepositCmd(ledgerCmd);
    } else if (
      LedgerCommand.isWithdrawFromPeerCmd(ledgerCmd) ||
      LedgerCommand.isWithdrawFromAseCmd(ledgerCmd)
    ) {
      await this._processWithdrawCmd(ledgerCmd);
    } else {
      throw new Error(`unhandled command with msgName: '${ledgerCmd.msgName}'`);
    }

    //this._logger.debug(`Ledger ${this.id} - processed command: ${cmd.msgName}`);
  }

  executeSnapshot(): LedgerSnapshotEvent {
    // NOTE snapshots store the current version, as such
    // they mustn't change anything, only take a picture

    const snapshot = new LedgerSnapshotEvent(
      this.id,
      this._version.toString(),
      {
        assetScale: this._assetScale,
        accounts: this._accounts.map(LedgerAccountDtoSerializer.toDTO),
        transactionCount: this._transactionCount.toString()
      }
    );

    this._lastSnapshotVersion = this._version;
    return snapshot;
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
    ids.forEach((id) => {
      const account = this._accounts.find((a) => a.id === id);
      if (account) {
        list.push(account);
      }
    });
    return list;
  }

  printStats() {
    const header = 'LEDGER STATE ' + '-'.repeat(20);
    const footer = '-'.repeat(header.length);

    let output = `Version:               ${this._version}\n`;
    output += `Last snapshot version: ${this._lastSnapshotVersion}\n`;
    output += `Accounts:              ${this._accounts.length}\n`;
    output += `Transactions:          ${this._transactionCount}`;

    this._logger.info(`${header}\n${output}\n${footer}\n`);
  }

  verify(): boolean {
    let totalDebited = 0n;
    let totalCredited = 0n;
    this._accounts.forEach((account) => {
      totalDebited += account.debitedAmount;
      totalCredited += account.creditedAmount;
    });

    return totalDebited == totalCredited;
  }

  // DTO serialization functions

  toDTO(): ILedgerDto {
    return {
      id: this.id,
      assetScale: this.assetScale,
      version: this.version.toString()
    };
  }
}
