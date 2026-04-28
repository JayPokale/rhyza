import { Message } from 'common-types-lib';
import {
  IIlpClientPort,
  IPaymentIntent,
  IPaymentIntentRepository,
  IRatesService,
  IRemotePaymentIntentPort,
  IWalletAddressService,
  PaymentIntentDestination,
  PaymentIntentState,
  PaymentState,
  WalletAddress
} from './interfaces';
import { PaymentIntent } from './entity';
import {
  CreatePaymentIntentCmd,
  CreateQuoteCmd,
  CreatePaymentCmd,
  ApprovePaymentCmd,
  FinalizeRemoteQuoteCmd,
  FailRemoteQuoteCmd,
  FetchRemotePaymentIntentCmd
} from '../commands';
import {
  CannotCreateDuplicatePaymentIntentError,
  WalletAddressNotFoundError,
  WalletAddressInactiveError,
  PaymentIntentNotFoundError,
  PaymentIntentInvalidState,
  RatesError
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
  RemoteQuoteFailedEvent,
  RemotePaymentIntentFetchedEvent,
  RemotePaymentIntentFetchFailedEvent
} from './events';

export class PaymentIntentAggregate {
  private newPaymentIntentIds: string[] = [];
  private newPaymentIntentQuotes = new Map<string, string[]>(); // paymentIntentId, quoteIds
  private newPaymentsMap = new Map<string, string[]>(); // paymentIntentId, paymentIds
  private completedLocalPayments = new Map<string, string[]>(); // paymentIntentId, paymentIds
  private paymentIntentMap = new Map<string, IPaymentIntent>();
  private walletAddressMap = new Map<string, WalletAddress>();

  constructor(
    private _repo: IPaymentIntentRepository,
    private _walletAddressService: IWalletAddressService,
    private _ratesService: IRatesService,
    private _remotePaymentIntentPort: IRemotePaymentIntentPort,
    private _ilpClientPort: IIlpClientPort
  ) {}

  async handleBatch(cmds: Message[]): Promise<{ events: Message[] }> {
    const outputEvents: Message[] = [];

    // prefetch any external data needed to process the batch
    const walletAddressIdSet = new Set<string>();
    const paymentIntentIdsSet = new Set<string>();
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
      } else if (cmd.msgName === FinalizeRemoteQuoteCmd.name) {
        const payload = (cmd as FinalizeRemoteQuoteCmd).payload;
        paymentIntentIdsSet.add(payload.paymentIntentId);
      } else if (cmd.msgName === FailRemoteQuoteCmd.name) {
        const payload = (cmd as FailRemoteQuoteCmd).payload;
        paymentIntentIdsSet.add(payload.paymentIntentId);
      } else if (cmd.msgName === FetchRemotePaymentIntentCmd.name) {
        const payload = (cmd as FetchRemotePaymentIntentCmd).payload;
        paymentIntentIdsSet.add(payload.id);
      }
    }

    const [walletAddresses, existingPaymentIntents] = await Promise.all([
      this._walletAddressService.fetchByIds([...walletAddressIdSet]),
      this._repo.fetchByIdsWithPayments([...paymentIntentIdsSet])
    ]);

    for (const walletAddress of walletAddresses) {
      this.walletAddressMap.set(walletAddress.id, walletAddress);
    }

    for (const paymentIntent of existingPaymentIntents) {
      this.paymentIntentMap.set(paymentIntent.id, paymentIntent);
    }

    for (const cmd of cmds) {
      let event: Message;
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
      } else if (cmd.msgName === FinalizeRemoteQuoteCmd.name) {
        event = this.handleFinalizeRemoteQuoteCommand(
          cmd as FinalizeRemoteQuoteCmd
        );
      } else if (cmd.msgName === FailRemoteQuoteCmd.name) {
        event = this.handleFailRemoteQuoteCommand(cmd as FailRemoteQuoteCmd);
      } else if (cmd.msgName === FetchRemotePaymentIntentCmd.name) {
        event = await this.handleFetchRemotePaymentIntentCommand(
          cmd as FetchRemotePaymentIntentCmd
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

      // TODO: determine from peer lookup (should probably move this to prefetch phase)
      // const peer = await this._palClient.getPeerByWalletAddress(receiverWalletAddress)
      // - lookup by receiverWalletAddress or receiverWalletAddressId? And what will peer be?
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

      // TODO (FX): for local quotes, the exchange rate is fetched here and used to compute amounts.
      // Unclear what service backs _ratesService and whether this is the correct/authoritative FX source.
      const exchangeRate = await this._ratesService.getRate(
        walletAddress.assetCode,
        paymentIntent.assetCode
      );

      if (!exchangeRate) {
        throw new RatesError('Could not get rates during quoting');
      }

      if (paymentIntent.destination === 'LOCAL') {
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
        this.appendToMap(
          this.newPaymentIntentQuotes,
          paymentIntent.id,
          quoteId
        );

        return new QuoteCompletedEvent({ id: quoteId }, cmd.requestId);
      }

      // TODO: Diagram shows "Determine peer based on destination address" using ILP BC.
      // rafiki-poc/internal-docs/sequence-diagrams/ILP/Remote Quote - Sending.md
      // Unclear what this is signifying. Kinda looks async (no response) but seems
      // to indicate we are getting the peer, except surely we would ge this from PAL?

      // REMOTE: create pending quote, emit event for ILP BC to initiate quoting
      // TODO: debitAmount/receiveAmount on RemoteQuoteRequestedEvent sufficient for auditing or
      // should we store on quote as well? requestedDebitAmount etc.
      // - FWIW, Rafiki v1 does not persist requested (nor has event to trace)
      paymentIntent.addPendingRemoteQuote({
        id: quoteId,
        senderWalletAddress: {
          id: senderWalletAddressId,
          address: senderWalletAddress
        }
      });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this.appendToMap(this.newPaymentIntentQuotes, paymentIntent.id, quoteId);

      // TODO: should assume destination ilp address was on fetched remote payment intent. stub that.
      const destinationIlpAddress = '';
      const { peerId } = await this._ilpClientPort.resolvePeerByAddress(
        destinationIlpAddress
      );

      return new RemoteQuoteRequestedEvent(
        {
          paymentIntentId,
          quoteId,
          senderWalletAddress,
          senderWalletAddressId,
          receiverWalletAddress: paymentIntent.receiverWalletAddress,
          senderAssetCode: walletAddress.assetCode,
          senderAssetScale: walletAddress.assetScale,
          receiverAssetCode: paymentIntent.assetCode,
          receiverAssetScale: paymentIntent.assetScale,
          debitAmount: debitAmount != null ? String(debitAmount) : undefined,
          receiveAmount:
            receiveAmount != null ? String(receiveAmount) : undefined,
          peerId,
          destinationIlpAddress
        },
        cmd.requestId
      );
    } catch (err) {
      const event = new QuoteCreateFailedEvent(
        {
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
      this.appendToMap(this.newPaymentsMap, paymentIntent.id, paymentId);

      return new PaymentCreatedEvent({ id: paymentId }, cmd.requestId);
    } catch (err) {
      const event = new PaymentCreateFailedEvent(
        {
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );

      return event;
    }
  }

  private handleFinalizeRemoteQuoteCommand(cmd: FinalizeRemoteQuoteCmd) {
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

      // TODO (FX): exchange rate is provided by ILP BC via FinalizeRemoteQuoteCmd.
      // Should Payments BC validate or cross-check this rate against its own FX source?
      paymentIntent.completeRemoteQuote({
        id: quoteId,
        debitAmount: BigInt(maxSourceAmount),
        receiveAmount: BigInt(minDeliveryAmount),
        exchangeRate: lowEstimatedExchangeRate
      });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());
      this.appendToMap(this.newPaymentIntentQuotes, paymentIntent.id, quoteId);

      // TODO: include exchange rate per Max's slack comment? Kinda breaks pattern of just returning id's
      // and looking up where we care to. Clarify this idea.
      return new QuoteCompletedEvent({ id: quoteId }, cmd.requestId);
    } catch (err) {
      return new QuoteCreateFailedEvent(
        {
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private handleFailRemoteQuoteCommand(cmd: FailRemoteQuoteCmd) {
    // TODO: should we change from PENDING to a new FAILED QuoteState? Could it ever be retried? Anything else?
    return new QuoteCreateFailedEvent(
      { errorName: cmd.payload.errorName, message: cmd.payload.message },
      cmd.requestId
    );
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
      this.appendToMap(
        this.completedLocalPayments,
        paymentIntent.id,
        paymentId
      );

      return new LocalPaymentCompletedEvent({ id: paymentId }, cmd.requestId);
    } catch (err) {
      return new LocalPaymentCompleteFailedEvent(
        {
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private async handleFetchRemotePaymentIntentCommand(
    cmd: FetchRemotePaymentIntentCmd
  ) {
    const { id, url } = cmd.payload;

    try {
      if (this.paymentIntentMap.has(id)) {
        return new RemotePaymentIntentFetchedEvent({ id }, cmd.requestId);
      }

      // TODO: this should be prefetched?
      const details =
        await this._remotePaymentIntentPort.fetchIncomingPayment(url);

      // TODO: what should receiverWalletAddressId be? we dont have it for
      // remote payment intents. Using the remote wallet address URL as a placeholder.
      // OK? Should it be optional instead?
      const entity = PaymentIntent.create(
        id,
        details.walletAddress,
        details.walletAddress,
        PaymentIntentDestination.REMOTE,
        details.assetCode,
        details.assetScale,
        details.expiresAt ?? null,
        details.incomingAmount ?? null
      );

      this.paymentIntentMap.set(id, entity.toObject());
      this.newPaymentIntentIds.push(id);

      return new RemotePaymentIntentFetchedEvent({ id }, cmd.requestId);
    } catch (err) {
      return new RemotePaymentIntentFetchFailedEvent(
        {
          errorName: (err as Error).constructor.name,
          message: (err as Error).message
        },
        cmd.requestId
      );
    }
  }

  private appendToMap(
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
          console.error(
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
          console.error(
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
          console.error(
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
          console.error(
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

    // TODO handle gracefully
    try {
      await Promise.all(promises);
    } finally {
      this.paymentIntentMap.clear();
      this.walletAddressMap.clear(); // TODO: wallet addresses are OK to be cached
      this.newPaymentsMap.clear();
      this.completedLocalPayments.clear();
      this.newPaymentIntentQuotes.clear();
      this.newPaymentIntentIds = [];
    }
  }
}
