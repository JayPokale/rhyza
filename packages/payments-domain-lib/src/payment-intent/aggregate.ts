import { ILogger, IMessage } from 'common-types-lib';
import {
  FinalizedRemoteQuoteUpdate,
  IPaymentIntent,
  IPaymentIntentRepository,
  IRatesService,
  IRemotePaymentIntentService,
  IWalletAddressService,
  PaymentIntentDestination,
  PaymentIntentState,
  PaymentState,
  IWalletAddress
} from './interfaces';
import { PaymentIntent } from './entity';
import {
  CreatePaymentIntentCmd,
  CreateQuoteCmd,
  CreatePaymentCmd,
  ApprovePaymentCmd,
  CompleteRemoteQuoteCmd,
  FailRemoteQuoteCmd,
  ImportRemotePaymentIntentCmd
} from '../commands';
import {
  CannotCreateDuplicatePaymentIntentError,
  WalletAddressNotFoundError,
  WalletAddressInactiveError,
  PaymentIntentNotFoundError,
  PaymentIntentInvalidState,
  RatesError,
  MissingDestinationIlpAddressError
} from './errors';
import {
  QuoteCompletedEvent,
  QuoteCreateFailedEvent,
  PaymentIntentCreatedEvent,
  PaymentIntentCreateFailedEvent,
  PaymentCreateFailedEvent,
  LocalPaymentCompletedEvent,
  LocalPaymentCompleteFailedEvent,
  PaymentCreatedEvent,
  RemoteQuoteRequestedEvent,
  RemotePaymentIntentImportedEvent,
  RemotePaymentIntentImportFailedEvent
} from './events';

export class PaymentIntentAggregate {
  private newPaymentIntentIds: string[] = [];
  private newPaymentIntentQuotes = new Map<string, string[]>(); // paymentIntentId, quoteIds
  private newPaymentsMap = new Map<string, string[]>(); // paymentIntentId, paymentIds
  private completedLocalPayments = new Map<string, string[]>(); // paymentIntentId, paymentIds
  private finalizedRemoteQuotes = new Map<string, string[]>(); // paymentIntentId, quoteIds
  private paymentIntentMap = new Map<string, IPaymentIntent>();
  private walletAddressMap = new Map<string, IWalletAddress>();
  private remotePaymentIntentFetchErrors = new Map<string, Error>();
  private proposedToExistingRemoteIntentIds = new Map<string, string>(); // proposed id -> existing id

  constructor(
    private _repo: IPaymentIntentRepository,
    private _walletAddressService: IWalletAddressService,
    private _ratesService: IRatesService,
    private _remotePaymentIntentService: IRemotePaymentIntentService,
    private _logger: ILogger
  ) {}

  async handleBatch(cmds: IMessage[]): Promise<{ events: IMessage[] }> {
    const outputEvents: IMessage[] = [];

    // prefetch any external data needed to process the batch
    const walletAddressIdSet = new Set<string>();
    const paymentIntentIdsSet = new Set<string>();
    const remotePaymentIntentUrlMap = new Map<string, string>(); // id -> url
    const remoteUrlToId = new Map<string, string>(); // url -> id
    for (const cmd of cmds) {
      if (cmd.msgName === CreatePaymentIntentCmd.name) {
        const payload = (cmd as CreatePaymentIntentCmd).payload;
        walletAddressIdSet.add(payload.receiverWalletAddressId);
        paymentIntentIdsSet.add(payload.id);
      } else if (cmd.msgName === CreateQuoteCmd.name) {
        const payload = (cmd as CreateQuoteCmd).payload;
        paymentIntentIdsSet.add(payload.paymentIntentId);
        walletAddressIdSet.add(payload.senderWalletAddressId);
      } else if (cmd.msgName === CreatePaymentCmd.name) {
        const payload = (cmd as CreatePaymentCmd).payload;
        walletAddressIdSet.add(payload.senderWalletAddressId);
        paymentIntentIdsSet.add(payload.paymentIntentId);
      } else if (cmd.msgName === ApprovePaymentCmd.name) {
        const payload = (cmd as ApprovePaymentCmd).payload;
        paymentIntentIdsSet.add(payload.paymentIntentId);
      } else if (cmd.msgName === CompleteRemoteQuoteCmd.name) {
        const payload = (cmd as CompleteRemoteQuoteCmd).payload;
        paymentIntentIdsSet.add(payload.paymentIntentId);
      } else if (cmd.msgName === FailRemoteQuoteCmd.name) {
        const payload = (cmd as FailRemoteQuoteCmd).payload;
        paymentIntentIdsSet.add(payload.paymentIntentId);
      } else if (cmd.msgName === ImportRemotePaymentIntentCmd.name) {
        const payload = (cmd as ImportRemotePaymentIntentCmd).payload;
        const existingIdForUrl = remoteUrlToId.get(payload.url);
        if (existingIdForUrl) {
          // duplicate URL within this batch — remap immediately, skip fetch
          this.proposedToExistingRemoteIntentIds.set(
            payload.id,
            existingIdForUrl
          );
        } else {
          remotePaymentIntentUrlMap.set(payload.id, payload.url);
          remoteUrlToId.set(payload.url, payload.id);
          paymentIntentIdsSet.add(payload.id);
        }
      }
    }

    const [walletAddresses, existingPaymentIntents, existingByUrl] =
      await Promise.all([
        this._walletAddressService.fetchByIds([...walletAddressIdSet]),
        this._repo.fetchByIdsWithPayments([...paymentIntentIdsSet]),
        this._repo.fetchIdsByRemoteUrls([...remoteUrlToId.keys()])
      ]);

    for (const walletAddress of walletAddresses) {
      this.walletAddressMap.set(walletAddress.id, walletAddress);
    }

    for (const paymentIntent of existingPaymentIntents) {
      this.paymentIntentMap.set(paymentIntent.id, paymentIntent);
    }

    await this._resolveAndFetchRemotePaymentIntents(
      remotePaymentIntentUrlMap,
      remoteUrlToId,
      existingByUrl
    );

    for (const cmd of cmds) {
      let event: IMessage;
      if (cmd.msgName === CreatePaymentIntentCmd.name) {
        event = this.handleCreatePaymentIntentCommand(
          cmd as CreatePaymentIntentCmd
        );
      } else if (cmd.msgName === CreateQuoteCmd.name) {
        event = await this.handleCreateQuoteCommand(cmd as CreateQuoteCmd);
      } else if (cmd.msgName === CreatePaymentCmd.name) {
        event = await this.handleCreatePaymentCommand(cmd as CreatePaymentCmd);
      } else if (cmd.msgName === ApprovePaymentCmd.name) {
        event = await this.handleApprovePaymentCommand(
          cmd as ApprovePaymentCmd
        );
      } else if (cmd.msgName === CompleteRemoteQuoteCmd.name) {
        event = this.handleCompleteRemoteQuoteCommand(
          cmd as CompleteRemoteQuoteCmd
        );
      } else if (cmd.msgName === FailRemoteQuoteCmd.name) {
        event = this.handleFailRemoteQuoteCommand(cmd as FailRemoteQuoteCmd);
      } else if (cmd.msgName === ImportRemotePaymentIntentCmd.name) {
        event = this.handleImportRemotePaymentIntentCommand(
          cmd as ImportRemotePaymentIntentCmd
        );
      } else {
        throw new Error('Unexpected command');
      }

      outputEvents.push(event);
    }

    return { events: outputEvents };
  }

  private handleCreatePaymentIntentCommand(cmd: CreatePaymentIntentCmd) {
    try {
      const {
        id,
        receiverWalletAddressId,
        receiverWalletAddress,
        expiresAt,
        incomingAmount
      } = cmd.payload;

      if (this.paymentIntentMap.has(id)) {
        throw new CannotCreateDuplicatePaymentIntentError(
          `Payment intent with id ${id} already exists`
        );
      }

      const walletAddress = this.walletAddressMap.get(receiverWalletAddressId);
      if (!walletAddress) {
        throw new WalletAddressNotFoundError(
          `Wallet address ${receiverWalletAddressId} not found`
        );
      }
      if (!walletAddress.isActive) {
        throw new WalletAddressInactiveError(
          `Wallet address ${receiverWalletAddressId} is not active`
        );
      }

      // NOTE: Should we validate asset match if incomingAmount provided?
      // Currently incomingAmount on the command is a bare number.
      // Keep and use wallet address asset? Or require as means of confirming
      // the sender understands the asset to be used?
      // - v1 Rafiki requires it to be passed in

      const destination = PaymentIntentDestination.LOCAL;

      const entity = PaymentIntent.create(
        id,
        receiverWalletAddressId,
        receiverWalletAddress,
        destination,
        walletAddress.assetCode,
        walletAddress.assetScale,
        expiresAt ?? null,
        incomingAmount != null ? BigInt(incomingAmount) : null
      );

      this.paymentIntentMap.set(id, entity.toObject());
      this.newPaymentIntentIds.push(id);

      const event = new PaymentIntentCreatedEvent({ id }, cmd.requestId);

      return event;
    } catch (err) {
      const event = new PaymentIntentCreateFailedEvent(
        {
          paymentIntentId: cmd.payload.id,
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );

      return event;
    }
  }

  private async handleCreateQuoteCommand(cmd: CreateQuoteCmd) {
    try {
      const {
        id: quoteId,
        senderWalletAddressId,
        senderWalletAddress,
        receiveAmount,
        debitAmount,
        paymentIntentId
      } = cmd.payload;

      const walletAddress = this.walletAddressMap.get(senderWalletAddressId);
      if (!walletAddress) {
        throw new WalletAddressNotFoundError(
          `Wallet address ${senderWalletAddressId} not found`
        );
      }
      if (!walletAddress.isActive) {
        throw new WalletAddressInactiveError(
          `Wallet address ${senderWalletAddressId} is not active`
        );
      }

      const paymentIntentObj = this.paymentIntentMap.get(paymentIntentId);
      if (!paymentIntentObj) {
        throw new PaymentIntentNotFoundError(
          `Payment intent ${paymentIntentId} not found`
        );
      }

      // NOTE: Do we check here if the receiving wallet address is deactivated?
      // Or is payment intent deactivation something that we could handle on a "wallet deactivated" event,
      // where we just mark all of the payment intents as EXPIRED/COMPLETED?

      const paymentIntent = PaymentIntent.fromObject(paymentIntentObj);

      if (paymentIntent.destination === 'LOCAL') {
        const exchangeRate = await this._ratesService.getRate(
          walletAddress.assetCode,
          paymentIntent.assetCode
        );

        if (!exchangeRate) {
          throw new RatesError('Could not get rates during quoting');
        }

        paymentIntent.addLocalQuote({
          id: quoteId,
          senderWalletAddress: {
            id: senderWalletAddressId,
            address: senderWalletAddress,
            assetScale: walletAddress.assetScale,
            assetCode: walletAddress.assetCode
          },
          debitAmount: debitAmount ? BigInt(debitAmount) : undefined,
          receiveAmount: receiveAmount ? BigInt(receiveAmount) : undefined,
          exchangeRate
        });

        this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
        this._appendToMap(
          this.newPaymentIntentQuotes,
          paymentIntent.id,
          quoteId
        );

        return new QuoteCompletedEvent({ id: quoteId }, cmd.requestId);
      }

      // REMOTE: create pending quote, emit event to initiate quoting
      paymentIntent.addPendingRemoteQuote({
        id: quoteId,
        senderWalletAddress: {
          id: senderWalletAddressId,
          address: senderWalletAddress
        }
      });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this._appendToMap(this.newPaymentIntentQuotes, paymentIntent.id, quoteId);

      const { destinationIlpAddress } = paymentIntent;
      if (!destinationIlpAddress) {
        throw new MissingDestinationIlpAddressError(
          `Payment intent ${paymentIntentId} is missing destinationIlpAddress`
        );
      }

      return new RemoteQuoteRequestedEvent(
        {
          paymentIntentId,
          quoteId,
          senderWalletAddress,
          receiverWalletAddress: paymentIntent.receiverWalletAddress,
          senderAssetCode: walletAddress.assetCode,
          senderAssetScale: walletAddress.assetScale,
          receiverAssetCode: paymentIntent.assetCode,
          receiverAssetScale: paymentIntent.assetScale,
          debitAmount: debitAmount != null ? String(debitAmount) : undefined,
          receiveAmount:
            receiveAmount != null ? String(receiveAmount) : undefined,
          destinationIlpAddress
        },
        cmd.requestId
      );
    } catch (err) {
      const event = new QuoteCreateFailedEvent(
        {
          paymentIntentId: cmd.payload.paymentIntentId,
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );

      return event;
    }
  }

  private async handleCreatePaymentCommand(cmd: CreatePaymentCmd) {
    const {
      id: paymentId,
      senderWalletAddressId,
      senderWalletAddress,
      paymentIntentId,
      quoteId,
      debitAmount
    } = cmd.payload;

    try {
      const walletAddress = this.walletAddressMap.get(senderWalletAddressId);
      if (!walletAddress) {
        throw new WalletAddressNotFoundError(
          `Wallet address ${senderWalletAddressId} not found`
        );
      }
      if (!walletAddress.isActive) {
        throw new WalletAddressInactiveError(
          `Wallet address ${senderWalletAddressId} is not active`
        );
      }

      const paymentIntentObj = this.paymentIntentMap.get(paymentIntentId);
      if (!paymentIntentObj) {
        throw new PaymentIntentNotFoundError(
          `Payment intent ${paymentIntentId} not found`
        );
      }

      const paymentIntent = PaymentIntent.fromObject(paymentIntentObj);

      if (paymentIntent.destination !== 'LOCAL') {
        throw new PaymentIntentInvalidState(
          'Payment intent destination must be local'
        );
      }

      const exchangeRate = await this._ratesService.getRate(
        walletAddress.assetCode,
        paymentIntent.assetCode
      );

      if (!exchangeRate) {
        throw new RatesError('Could not get rates during quoting');
      }

      paymentIntent.addLocalPayment({
        id: paymentId,
        senderWalletAddress: {
          id: senderWalletAddressId,
          address: senderWalletAddress,
          assetScale: walletAddress.assetScale,
          assetCode: walletAddress.assetCode
        },
        exchangeRate,
        quoteId,
        debitAmount: debitAmount ? BigInt(debitAmount) : undefined
      });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this._appendToMap(this.newPaymentsMap, paymentIntent.id, paymentId);

      return new PaymentCreatedEvent({ id: paymentId }, cmd.requestId);
    } catch (err) {
      const event = new PaymentCreateFailedEvent(
        {
          paymentIntentId: cmd.payload.paymentIntentId,
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );

      return event;
    }
  }

  private handleCompleteRemoteQuoteCommand(cmd: CompleteRemoteQuoteCmd) {
    const {
      quoteId,
      paymentIntentId,
      maxSourceAmount,
      minDeliveryAmount,
      lowEstimatedExchangeRate
    } = cmd.payload;

    try {
      const paymentIntentObj = this.paymentIntentMap.get(paymentIntentId);
      if (!paymentIntentObj) {
        throw new PaymentIntentNotFoundError(
          `Payment intent ${paymentIntentId} not found`
        );
      }

      const paymentIntent = PaymentIntent.fromObject(paymentIntentObj);

      paymentIntent.completeRemoteQuote({
        id: quoteId,
        debitAmount: BigInt(maxSourceAmount),
        receiveAmount: BigInt(minDeliveryAmount),
        exchangeRate: lowEstimatedExchangeRate
      });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this._appendToMap(this.finalizedRemoteQuotes, paymentIntent.id, quoteId);

      return new QuoteCompletedEvent({ id: quoteId }, cmd.requestId);
    } catch (err) {
      return new QuoteCreateFailedEvent(
        {
          paymentIntentId: cmd.payload.paymentIntentId,
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private handleFailRemoteQuoteCommand(cmd: FailRemoteQuoteCmd) {
    const { quoteId, paymentIntentId, errorName, message } = cmd.payload;

    try {
      const paymentIntentObj = this.paymentIntentMap.get(paymentIntentId);
      if (!paymentIntentObj) {
        throw new PaymentIntentNotFoundError(
          `Payment intent ${paymentIntentId} not found`
        );
      }

      const paymentIntent = PaymentIntent.fromObject(paymentIntentObj);

      paymentIntent.failRemoteQuote({ id: quoteId, errorName, message });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this._appendToMap(this.finalizedRemoteQuotes, paymentIntent.id, quoteId);

      return new QuoteCreateFailedEvent(
        { paymentIntentId, errorName, message },
        cmd.requestId
      );
    } catch (err) {
      return new QuoteCreateFailedEvent(
        {
          paymentIntentId,
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private async handleApprovePaymentCommand(cmd: ApprovePaymentCmd) {
    const { id: paymentId, paymentIntentId } = cmd.payload;

    try {
      const paymentIntentObj = this.paymentIntentMap.get(paymentIntentId);
      if (!paymentIntentObj) {
        throw new PaymentIntentNotFoundError(
          `Payment intent ${paymentIntentId} not found`
        );
      }

      const paymentIntent = PaymentIntent.fromObject(paymentIntentObj);

      if (paymentIntent.destination !== 'LOCAL') {
        throw new PaymentIntentInvalidState(
          'Payment intent destination must be local'
        );
      }

      paymentIntent.completeLocalPayment({ id: paymentId });
      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this._appendToMap(
        this.completedLocalPayments,
        paymentIntent.id,
        paymentId
      );

      return new LocalPaymentCompletedEvent({ id: paymentId }, cmd.requestId);
    } catch (err) {
      return new LocalPaymentCompleteFailedEvent(
        {
          paymentIntentId: cmd.payload.paymentIntentId,
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private handleImportRemotePaymentIntentCommand(
    cmd: ImportRemotePaymentIntentCmd
  ) {
    const { id } = cmd.payload;

    // use pre-existing ID in case where remote payment intent was already imported
    const existingId = this.proposedToExistingRemoteIntentIds.get(id);
    if (existingId) {
      return new RemotePaymentIntentImportedEvent(
        { id: existingId },
        cmd.requestId
      );
    }

    const error = this.remotePaymentIntentFetchErrors.get(id);
    if (error) {
      return new RemotePaymentIntentImportFailedEvent(
        {
          paymentIntentId: id,
          errorName: error.constructor.name,
          message: error.message
        },
        cmd.requestId
      );
    }

    return new RemotePaymentIntentImportedEvent({ id }, cmd.requestId);
  }

  private async _resolveAndFetchRemotePaymentIntents(
    remotePaymentIntentUrlMap: Map<string, string>,
    remoteUrlToId: Map<string, string>,
    existingByUrl: Array<{ id: string; remoteUrl: string }>
  ): Promise<void> {
    // if the remote intent was already imported (with a different ID), point this
    // proposed ID at the one that already exists so that we don't create a duplicate
    for (const { id: existingId, remoteUrl } of existingByUrl) {
      const incomingId = remoteUrlToId.get(remoteUrl);
      if (incomingId) {
        this.proposedToExistingRemoteIntentIds.set(incomingId, existingId);
      }
    }

    // handle intra-batch duplicates by using the first seen id
    for (const [id, target] of this.proposedToExistingRemoteIntentIds) {
      const finalTarget = this.proposedToExistingRemoteIntentIds.get(target);
      if (finalTarget) {
        this.proposedToExistingRemoteIntentIds.set(id, finalTarget);
      }
    }

    const urlsToFetch: Array<[string, string]> = [];
    for (const [id, url] of remotePaymentIntentUrlMap) {
      if (
        !this.paymentIntentMap.has(id) &&
        !this.proposedToExistingRemoteIntentIds.has(id)
      ) {
        urlsToFetch.push([id, url]);
      }
    }

    const results = await Promise.all(
      urlsToFetch.map(async ([id, url]) => {
        try {
          const remotePaymentIntent =
            await this._remotePaymentIntentService.fetchIncomingPayment(url);
          return { id, url, remotePaymentIntent, error: null };
        } catch (err) {
          return { id, url, remotePaymentIntent: null, error: err as Error };
        }
      })
    );

    for (const { id, url, remotePaymentIntent, error } of results) {
      if (error) {
        this.remotePaymentIntentFetchErrors.set(id, error);
      } else {
        const entity = PaymentIntent.create(
          id,
          undefined,
          remotePaymentIntent.walletAddress,
          PaymentIntentDestination.REMOTE,
          remotePaymentIntent.assetCode,
          remotePaymentIntent.assetScale,
          remotePaymentIntent.expiresAt ?? null,
          remotePaymentIntent.incomingAmount ?? null,
          remotePaymentIntent.receivedAmount,
          remotePaymentIntent.destinationIlpAddress,
          url
        );
        this.paymentIntentMap.set(id, entity.toObject());
        this.newPaymentIntentIds.push(id);
      }
    }
  }

  private _appendToMap(
    map: Map<string, string[]>,
    paymentIntentId: string,
    idToAppend: string
  ) {
    if (!map.has(paymentIntentId)) {
      map.set(paymentIntentId, []);
    }

    map.get(paymentIntentId)?.push(idToAppend);
  }

  public async flush() {
    const promises = [];

    if (this.newPaymentIntentIds.length > 0) {
      const newEntities = [];
      for (const id of this.newPaymentIntentIds) {
        const paymentIntent = this.paymentIntentMap.get(id);
        if (!paymentIntent) {
          this._logger.error(
            `Payment intent ${id} missing from paymentIntentMap during flush (payment intents)`
          );
          continue;
        }

        newEntities.push(paymentIntent);
      }

      promises.push(this._repo.storeMany(newEntities));
    }

    if (this.newPaymentIntentQuotes.size > 0) {
      const updates: {
        paymentIntent: IPaymentIntent;
        quoteIds: string[];
      }[] = [];
      for (const [
        paymentIntentId,
        quoteIds
      ] of this.newPaymentIntentQuotes.entries()) {
        const paymentIntent = this.paymentIntentMap.get(paymentIntentId);
        if (!paymentIntent) {
          this._logger.error(
            `Payment intent ${paymentIntentId} missing from paymentIntentMap during flush (quotes)`
          );
          continue;
        }

        updates.push({ paymentIntent, quoteIds });
      }

      promises.push(this._repo.storeQuotes(updates));
    }

    if (this.newPaymentsMap.size > 0) {
      const updates: {
        paymentIntent: IPaymentIntent;
        paymentIds: string[];
      }[] = [];
      for (const [
        paymentIntentId,
        paymentIds
      ] of this.newPaymentsMap.entries()) {
        const paymentIntent = this.paymentIntentMap.get(paymentIntentId);
        if (!paymentIntent) {
          this._logger.error(
            `Payment intent ${paymentIntentId} missing from paymentIntentMap during flush (payments)`
          );
          continue;
        }

        updates.push({ paymentIntent, paymentIds });
      }

      promises.push(this._repo.storePayments(updates));
    }

    if (this.completedLocalPayments.size > 0) {
      const updates: {
        paymentIntent: {
          id: string;
          receivedAmount: bigint;
          state: PaymentIntentState;
        };
        payments: { id: string; state: PaymentState; sentAmount: bigint }[];
      }[] = [];

      for (const [
        paymentIntentId,
        paymentIds
      ] of this.completedLocalPayments.entries()) {
        const paymentIntent = this.paymentIntentMap.get(paymentIntentId);
        if (!paymentIntent) {
          this._logger.error(
            `Payment intent ${paymentIntentId} missing from paymentIntentMap during flush (payments)`
          );
          continue;
        }

        updates.push({
          paymentIntent: {
            id: paymentIntent.id,
            state: paymentIntent.state,
            receivedAmount: paymentIntent.receivedAmount
          },
          payments: paymentIntent.payments
            .filter((p) => paymentIds.includes(p.id))
            .map((p) => ({
              id: p.id,
              state: p.state,
              sentAmount: p.sentAmount
            }))
        });
      }

      promises.push(this._repo.storeCompletedLocalPayments(updates));
    }

    if (this.finalizedRemoteQuotes.size > 0) {
      const updates: FinalizedRemoteQuoteUpdate[] = [];

      for (const [
        paymentIntentId,
        quoteIds
      ] of this.finalizedRemoteQuotes.entries()) {
        const paymentIntent = this.paymentIntentMap.get(paymentIntentId);
        if (!paymentIntent) {
          this._logger.error(
            `Payment intent ${paymentIntentId} missing from paymentIntentMap during flush (finalized remote quotes)`
          );
          continue;
        }

        for (const quoteId of quoteIds) {
          const quote = paymentIntent.quotes.find((q) => q.id === quoteId);
          if (!quote) {
            this._logger.error(
              `Quote ${quoteId} missing from paymentIntentMap during flush`
            );
            continue;
          }
          if (quote.state === 'COMPLETED') {
            updates.push({
              paymentIntentId,
              quoteId,
              state: 'COMPLETED',
              debitAmount: quote.debitAmount,
              receiveAmount: quote.receiveAmount,
              exchangeRate: quote.exchangeRate,
              expiresAt: quote.expiresAt
            });
          } else if (quote.state === 'FAILED') {
            updates.push({
              paymentIntentId,
              quoteId,
              state: 'FAILED',
              errorName: quote.errorName,
              message: quote.message
            });
          } else {
            this._logger.error(
              `Quote ${quoteId} has unexpected state "${quote.state}" during flush`
            );
          }
        }
      }

      promises.push(this._repo.storeFinalizedRemoteQuotes(updates));
    }

    // TODO handle gracefully
    try {
      await Promise.all(promises);
    } finally {
      this.paymentIntentMap.clear();
      this.walletAddressMap.clear(); // TODO: wallet addresses are OK to be cached
      this.newPaymentsMap.clear();
      this.completedLocalPayments.clear();
      this.finalizedRemoteQuotes.clear();
      this.newPaymentIntentQuotes.clear();
      this.newPaymentIntentIds = [];
      this.remotePaymentIntentFetchErrors.clear();
      this.proposedToExistingRemoteIntentIds.clear();
    }
  }
}
