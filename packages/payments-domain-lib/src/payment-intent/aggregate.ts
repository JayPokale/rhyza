import { randomUUID } from 'crypto';
import { DomainEventMsg, Message } from 'common-types-lib';
import {
  IPaymentIntent,
  IPaymentIntentRepository,
  IQuote,
  IRatesServiceAdapter,
  IWalletAddressAdapter,
  PaymentIntentDestination,
  WalletAddress
} from './interfaces';
import { PaymentIntent } from './entity';
import { CreatePaymentIntentCmd, CreateQuoteCmd } from '../commands';
import {
  CannotCreateDuplicatePaymentIntentError,
  WalletAddressNotFoundError,
  WalletAddressInactiveError,
  PaymentIntentNotFoundError,
  PaymentIntentInvalidState,
  ConversionError,
  InvalidQuoteAmountError
} from './errors';
import {
  PaymentIntentCreatedEvent,
  PaymentIntentCreateFailedEvent,
  QuoteCompletedEvent,
  QuoteCreateFailedEvent
} from './events';

export class PaymentIntentAggregate {
  private newPaymentIntentIds: string[] = [];
  private newPaymentIntentQuotes = new Map<string, string[]>(); // paymentIntentId, quoteIds
  private paymentIntentMap = new Map<string, IPaymentIntent>();
  private walletAddressMap = new Map<string, WalletAddress>();

  constructor(
    private _repo: IPaymentIntentRepository,
    private _walletAddressService: IWalletAddressAdapter,
    private _ratesService: IRatesServiceAdapter
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
      }
    }

    const [walletAddresses, existingPaymentIntents] = await Promise.all([
      this._walletAddressService.fetchByIds([...walletAddressIdSet]),
      this._repo.fetchByIds([...paymentIntentIdsSet])
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
      // Currently incomingAmount on the command is currently a bare number.
      // Keep and use wallet address asset? Or require as means of confirming
      // the sender understands the asset to be used?
      // - v1 Rafiki requires it to be passed in

      const entity = PaymentIntent.create(
        id,
        receiverWalletAddressId,
        receiverWalletAddress,
        PaymentIntentDestination.LOCAL, // TODO: determine from peer lookup
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
        id,
        senderWalletAddressId,
        receiveAmount,
        debitAmount,
        paymentIntentId
      } = cmd.payload;

      const senderWalletAddress = this.walletAddressMap.get(
        senderWalletAddressId
      );
      if (!senderWalletAddress) {
        throw new WalletAddressNotFoundError(
          `Wallet address ${senderWalletAddressId} not found`
        );
      }
      if (!senderWalletAddress.isActive) {
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

      // TODO: handle ILP quotes
      if (paymentIntent.destination !== 'LOCAL') {
        throw new PaymentIntentInvalidState(
          'Payment intent destination must be local'
        );
      }

      const isValidPaymentIntentState =
        paymentIntent.state === 'CREATED' ||
        paymentIntent.state === 'PARTIALLY_PAID';

      if (!isValidPaymentIntentState) {
        throw new PaymentIntentInvalidState(
          `Payment intent is in an invalid state for quoting: ${paymentIntent.state}`
        );
      }

      if (paymentIntent.isExpired) {
        throw new PaymentIntentInvalidState(
          `Payment intent is expired at: ${paymentIntent.expiresAt.toISOString()}`
        );
      }

      let exchangeRate: number;
      let quoteReceiveAmount: bigint;
      let quoteDebitAmount: bigint;

      if (debitAmount) {
        const result = await this.calculateReceiveAmountFromDebitAmount(
          BigInt(debitAmount),
          senderWalletAddress,
          paymentIntent
        );

        quoteReceiveAmount = result.receiveAmount;
        exchangeRate = result.exchangeRate;
        quoteDebitAmount = BigInt(debitAmount);
      } else if (receiveAmount) {
        const result = await this.calculateDebitAmountFromReceiveAmount(
          BigInt(receiveAmount),
          senderWalletAddress,
          paymentIntent
        );

        quoteDebitAmount = result.debitAmount;
        exchangeRate = result.exchangeRate;
        quoteReceiveAmount = BigInt(receiveAmount);
      } else if (paymentIntent.incomingAmount) {
        const result = await this.calculateDebitAmountFromReceiveAmount(
          paymentIntent.incomingAmount, // We do not subtract the already delivered amount (that is bound to change at any given moment)
          senderWalletAddress,
          paymentIntent
        );

        quoteDebitAmount = result.debitAmount;
        exchangeRate = result.exchangeRate;
        quoteReceiveAmount = paymentIntent.incomingAmount;
      } else {
        throw new InvalidQuoteAmountError(
          'Quote request must have debitAmount, receiveAmount, or the payment intent must have an incomingAmount'
        );
      }

      paymentIntent.addCompletedQuote({
        id,
        senderWalletAddress: cmd.payload.senderWalletAddress,
        senderWalletAddressId,
        debitAmount: quoteDebitAmount,
        receiveAmount: quoteReceiveAmount,
        exchangeRate
      });

      this.paymentIntentMap.set(paymentIntent.id, paymentIntent.toObject());

      if (!this.newPaymentIntentQuotes.has(paymentIntent.id)) {
        this.newPaymentIntentQuotes.set(paymentIntent.id, []);
      }

      this.newPaymentIntentQuotes.get(paymentIntent.id)?.push(id);

      const quoteCompletedEvent = new QuoteCompletedEvent(
        { id },
        cmd.requestId
      );
      return quoteCompletedEvent;
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

  private async calculateReceiveAmountFromDebitAmount(
    debitAmount: bigint,
    senderWalletAddress: WalletAddress,
    paymentIntent: PaymentIntent
  ) {
    const isSameAssetQuote =
      senderWalletAddress.assetCode === paymentIntent.assetCode;

    if (isSameAssetQuote) {
      const exchangeRate =
        10 ** (paymentIntent.assetScale - senderWalletAddress.assetScale);
      const receiveAmount = BigInt(
        Math.floor(Number(debitAmount) * exchangeRate)
      );

      return {
        receiveAmount,
        exchangeRate
      };
    }

    const conversionResponse = await this._ratesService.convertFromDestination({
      sourceAsset: {
        code: senderWalletAddress.assetCode,
        scale: senderWalletAddress.assetScale
      },
      destinationAsset: {
        scale: paymentIntent.assetScale,
        code: paymentIntent.assetCode
      },
      destinationAmount: debitAmount
    });

    if (!conversionResponse) {
      throw new ConversionError(
        `Could not convert rates from ${senderWalletAddress.assetCode} to ${paymentIntent.assetCode}`
      );
    }

    return {
      receiveAmount: conversionResponse.sourceAmount,
      exchangeRate: conversionResponse.exchangeRate
    };
  }

  private async calculateDebitAmountFromReceiveAmount(
    receiveAmount: bigint,
    senderWalletAddress: WalletAddress,
    paymentIntent: PaymentIntent
  ) {
    const isSameAssetQuote =
      paymentIntent.assetCode === senderWalletAddress.assetCode;
    if (isSameAssetQuote) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2, may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (senderWalletAddress.assetScale - paymentIntent.assetScale);
      const debitAmount = BigInt(
        Math.ceil(Number(receiveAmount) * exchangeRate)
      );

      return {
        debitAmount,
        exchangeRate
      };
    }

    const conversionResponse = await this._ratesService.convertFromDestination({
      destinationAsset: {
        code: paymentIntent.assetCode,
        scale: paymentIntent.assetScale
      },
      destinationAmount: receiveAmount,
      sourceAsset: {
        code: senderWalletAddress.assetCode,
        scale: senderWalletAddress.assetScale
      }
    });

    if (!conversionResponse) {
      throw new ConversionError(
        `Could not convert rates from ${senderWalletAddress.assetCode} to ${paymentIntent.assetCode}`
      );
    }

    return {
      debitAmount: conversionResponse.sourceAmount,
      exchangeRate: conversionResponse.exchangeRate
    };
  }

  public async flush() {
    const promises = [];

    if (this.newPaymentIntentIds.length > 0) {
      const newEntities = [];
      for (const id of this.newPaymentIntentIds) {
        const paymentIntent = this.paymentIntentMap.get(id);
        if (!paymentIntent) {
          console.error(
            `Payment intent ${id} missing from paymentIntentMap during flush`
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
            `Payment intent ${paymentIntentId} missing from paymentIntentMap during flush`
          );
          continue;
        }

        updates.push({ paymentIntent, quoteIds });
      }

      promises.push(this._repo.storeQuotes(updates));
    }

    // TODO handle gracefully
    try {
      await Promise.all(promises);
    } finally {
      this.paymentIntentMap.clear();
      this.walletAddressMap.clear();
      this.newPaymentIntentQuotes.clear();
      this.newPaymentIntentIds = [];
    }
  }
}
