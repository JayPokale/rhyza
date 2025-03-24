import {
  FundWalletAddressLiquidityRequest,
  LiquidityRequestType,
  LiquidityServiceAdapter,
  PeerToWalletAddressLiquidityRequest,
  WalletAddressToPeerLiquidityRequest,
  WalletToWalletAddressLiquidityRequest,
} from "./liquidity";
import { IlpPeerServiceAdapter } from "./ilp-peer";
import { RatesServiceAdapter } from "./rates";
import { Amount, Asset } from "./shared";
import { WalletAddress, WalletAddressServiceAdapter } from "./wallet-address";
import { Event, EventProducerAdapter } from "./event";
import { IlpDetails } from "./ilp-connector";
import {
  RemoteIncomingPayment,
  RemoteIncomingPaymentServiceAdapter,
} from "./remote-incoming-payment";
import { TelemetryService } from "telemetry";

export class WalletAddressNotFoundError extends Error {}
export class WalletAddressInactiveError extends Error {}
export class IncomingPaymentWalletAddressAssetMismatchError extends Error {}
export class IncomingPaymentNotFoundError extends Error {}
export class IncomingPaymentInvalidStateError extends Error {}
export class InvalidIncomingPaymentExpiryError extends Error {}
export class DuplicateIncomingPaymentFoundError extends Error {}
export class InvalidQuoteAmountError extends Error {}
export class CouldNotConvertExchangeRatesError extends Error {}
export class DuplicateQuoteFoundError extends Error {}
export class QuoteNotFoundError extends Error {}
export class PeerNotFoundError extends Error {}
export class QuoteExpiredError extends Error {}
export class IncomingPaymentCannotReceiveMicroPayment extends Error {}
export class DuplicateOutgoingPaymentFoundError extends Error {}
export class OutgoingPaymentNotFoundError extends Error {}
export class OutgoingPaymentInvalidStateError extends Error {}

interface CreateIncomingPaymentRequest {
  id?: string;
  walletAddressId: string; // we can consider using URIs here: might be easier for integrators to deal with + gives us flexibility particularly when it comes to paying into incoming payments on remote Rafikis
  expiresAt?: Date;
  incomingAmount?: Amount;
}

export interface Quote {
  id: string;
  receiveAmount: Amount;
  debitAmount: Amount;
  senderWalletAddressId: string;
  incomingPaymentId: string;
  expiresAt: Date;
  exchangeRate: number;
}

export const OutgoingPaymentState = {
  CREATED: "CREATED", // normal state, can add new entries
  FUNDED: "FUNDED", // normal state, can add new entries
  COMPLETED: "COMPLETED", // not available to reads or writes, historic only (can be changed back to inactive)
} as const;
export type OutgoingPaymentState = keyof typeof OutgoingPaymentState;

// Before starting ILP payment
// reserve funds: settlement account -> wallet address
// reserve funds: asset liquidity -> "pending payments account"

export interface MicroPayment {
  method: "LOCAL" | "ILP";
  ilpPeerId?: string;
  requestId: string;
  amount: bigint;
}

export interface OutgoingPayment {
  id: string;
  quoteId: string;
  asset: Asset;
  state: OutgoingPaymentState;
  sentAmount: bigint;
  debitAmount: bigint;
  localIncomingPaymentId?: string;
  remoteIncomingPaymentUrl?: string;
  senderWalletAddressId: string;
}

export type OutgoingPaymentWithMicroPayments = OutgoingPayment & {
  microPayments: MicroPayment[];
};

export interface IncomingPaymentWithNewMicroPaymentUpdate {
  microPayment: MicroPayment;
  state?: LocalIncomingPaymentState;
  receivedAmount: bigint;
}

export interface IIncomingPaymentRepository {
  exists(id: string): Promise<boolean>;
  store(payment: IncomingPayment): Promise<void>;
  fetchById(id: string): Promise<IncomingPayment | undefined>;
  updateWithNewMicroPayment(
    incomingPayment: IncomingPayment,
    update: IncomingPaymentWithNewMicroPaymentUpdate
  ): Promise<void>;
}

export interface IQuoteRepository {
  exists(id: string): Promise<boolean>;
  store(quote: Quote): Promise<void>;
  fetchById(id: string): Promise<Quote | undefined>;
  updateAmounts(request: { id: string; amount: bigint }): Promise<void>;
}

export interface OutgoingPaymentWithNewMicroPaymentUpdate {
  microPayment: MicroPayment;
  state?: OutgoingPaymentState;
  sentAmount: bigint;
}

export interface IOutgoingPaymentRepository {
  exists(id: string): Promise<boolean>;
  store(payment: OutgoingPayment): Promise<void>;
  fetchById(id: string): Promise<OutgoingPayment | undefined>;
  updateWithNewMicroPayment(
    outgoingPayment: OutgoingPayment,
    request: OutgoingPaymentWithNewMicroPaymentUpdate
  ): Promise<void>;
}

export enum PaymentEventType {
  INCOMING_PAYMENT_CREATED = "INCOMING_PAYMENT_CREATED",
  INCOMING_PAYMENT_COMPLETED = "INCOMING_PAYMENT_COMPLETED",
  OUTGOING_PAYMENT_COMPLETED = "OUTGOING_PAYMENT_COMPLETED",
  REMOTE_OUTGOING_PAYMENT_FUNDED = "REMOTE_OUTGOING_PAYMENT_FUNDED",
  LOCAL_OUTGOING_PAYMENT_FUNDED = "LOCAL_OUTGOING_PAYMENT_FUNDED",
  REMOTE_QUOTE_REQUESTED = "REMOTE_QUOTE_REQUESTED",
  ILP_PAYMENT_PREPARE_PACKET_ACCEPTED = "ILP_PAYMENT_PREPARE_PACKET_ACCEPTED",
  ILP_QUOTE_PREPARE_PACKET_RECEIVED = "ILP_QUOTE_PREPARE_PACKET_RECEIVED",
  ILP_PAYMENT_FULFILL_PACKET_RECEIVED = "ILP_PAYMENT_FULFILL_PACKET_RECEIVED",
  ILP_PAYMENT_PREPARE_PACKET_RECEIVED = "ILP_PAYMENT_PREPARE_PACKET_RECEIVED",
}

interface IncomingPaymentCreatedEvent extends Event {
  type: PaymentEventType.INCOMING_PAYMENT_CREATED;
  data: {
    incomingPayment: IncomingPayment;
  };
}

export interface RemoteOutgoingPaymentFundedEvent extends Event {
  type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED;
  data: {
    outgoingPaymentId: string;
    debitAmount: Amount;
    receiveAmount: Amount;
    quoteExpiresAt: Date;
    remoteIncomingPaymentUrl: string;
    ilpDetails: IlpDetails;
  };
}

interface IncomingPaymentCompletedEvent extends Event {
  type: PaymentEventType.INCOMING_PAYMENT_COMPLETED;
  data: {
    incomingPayment: IncomingPayment;
  };
}

interface OutgoingPaymentCompletedEvent extends Event {
  type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED;
  data: {
    outgoingPayment: OutgoingPayment;
  };
}

interface LocalOutgoingPaymentFundedEvent extends Event {
  type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED;
  data: {
    quote: Quote;
    outgoingPayment: OutgoingPayment;
    incomingPayment: IncomingPayment;
  };
}

export interface RemoteQuoteRequestedEvent extends Event {
  type: PaymentEventType.REMOTE_QUOTE_REQUESTED;
  data: {
    quote: {
      id: string;
      debitAmount: Amount;
      expiresAt?: Date;
      senderWalletAddressId: string;
    };
    incomingPayment: RemoteIncomingPayment;
  };
}

export interface IlpPaymentPreparePacketAcceptedEvent extends Event {
  type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_ACCEPTED;
  data: {
    amount: Amount;
    requestId: string;
    incomingPaymentCompleted: boolean;
  };
}

export interface IlpPaymentPreparePacketReceivedEvent extends Event {
  type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_RECEIVED;
  data: {
    requestId: string;
    incomingPaymentId: string;
    peerId: string;
    amount: bigint;
  };
}

export interface IlpPaymentFulfillPacketReceivedEvent extends Event {
  type: PaymentEventType.ILP_PAYMENT_FULFILL_PACKET_RECEIVED;
  data: {
    requestId: string;
    peerId: string;
    amount: Amount;
    outgoingPaymentId: string;
    didCompleteIncomingPayment: boolean;
  };
}

export interface IlpQuotePacketReceivedEvent extends Event {
  type: PaymentEventType.ILP_QUOTE_PREPARE_PACKET_RECEIVED;
  data: {
    requestId: string;
    peerId: string;
    amount: bigint;
    quoteId: string;
  };
}

const LocalIncomingPaymentState = {
  CREATED: "CREATED", // normal state, can add new micropayments
  EXPIRED: "EXPIRED", // available for reads only, cannot add new entries
  COMPLETED: "COMPLETED", // not available to reads or writes, historic only (can be changed back to inactive)
} as const;
export type LocalIncomingPaymentState = keyof typeof LocalIncomingPaymentState;

interface BaseIncomingPayment {
  expiresAt: Date;
  asset: Asset;
  incomingAmount?: bigint;
  receivedAmount: bigint;
}

export interface IncomingPayment extends BaseIncomingPayment {
  id: string;
  state: LocalIncomingPaymentState;
  walletAddressId: string;
  type: "LOCAL";
}

export type IncomingPaymentWithMicroPayments = IncomingPayment & {
  microPayments: MicroPayment[];
};

interface CreateQuoteRequest {
  id?: string;
  senderWalletAddressId: string;
  incomingPaymentId: string;
  debitAmount?: Amount;
  receiveAmount?: Amount;
}

interface CreateOutgoingPaymentFromQuoteRequest {
  id?: string;
  quoteId: string;
  senderWalletAddressId: string;
  // isFunded: boolean; TODO if the outgoing payment request came from a third party we need to webhook out to the ASE to "fund" the payment
}

export class PaymentService {
  private INCOMING_PAYMENT_MAX_EXPIRY_MS = 2592000000; // 30 days
  private INCOMING_PAYMENT_DEFAULT_EXPIRY = 1000 * 60 * 10;
  private QUOTE_EXPIRY_MS = 1000 * 60 * 10;

  constructor(
    private walletAddressService: WalletAddressServiceAdapter,
    private ilpPeerService: IlpPeerServiceAdapter,
    private ratesService: RatesServiceAdapter,
    private liquidityService: LiquidityServiceAdapter,
    private remoteIncomingPaymentService: RemoteIncomingPaymentServiceAdapter,
    private incomingPaymentRepository: IIncomingPaymentRepository,
    private outgoingPaymentRepository: IOutgoingPaymentRepository,
    private quoteRepository: IQuoteRepository,
    private paymentEventProducer: EventProducerAdapter,
    private telemetryService: TelemetryService
  ) {}

  public async createIncomingPayment(
    request: CreateIncomingPaymentRequest
  ): Promise<string> {
    let id: string;

    if (request.id) {
      const exists = await this.incomingPaymentRepository.exists(request.id);

      if (exists) {
        throw new DuplicateIncomingPaymentFoundError();
      }
      id = request.id;
    } else {
      id = crypto.randomUUID();
    }

    const walletAddress = await this.walletAddressService.getById(
      request.walletAddressId
    );

    if (!walletAddress) {
      throw new WalletAddressNotFoundError();
    }

    if (!walletAddress.isActive) {
      throw new WalletAddressInactiveError();
    }

    if (
      request.incomingAmount &&
      (walletAddress.assetCode !== request.incomingAmount.assetCode ||
        walletAddress.assetScale !== request.incomingAmount.assetScale)
    ) {
      throw new IncomingPaymentWalletAddressAssetMismatchError();
    }

    if (
      request.expiresAt &&
      (request.expiresAt.getTime() <= Date.now() ||
        request.expiresAt.getTime() >
          Date.now() + this.INCOMING_PAYMENT_MAX_EXPIRY_MS)
    ) {
      throw new InvalidIncomingPaymentExpiryError();
    }

    const expiresAt =
      request.expiresAt ??
      new Date(Date.now() + this.INCOMING_PAYMENT_DEFAULT_EXPIRY);

    const newIncomingPayment: IncomingPayment = {
      id,
      incomingAmount: request.incomingAmount?.value,
      receivedAmount: 0n,
      expiresAt,
      walletAddressId: request.walletAddressId,
      type: "LOCAL",
      state: LocalIncomingPaymentState.CREATED,
      asset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale,
      },
    };

    await this.incomingPaymentRepository.store(newIncomingPayment);
    await this.paymentEventProducer.publish([
      {
        type: PaymentEventType.INCOMING_PAYMENT_CREATED,
        data: {
          incomingPayment: newIncomingPayment,
        },
      },
    ]);

    return id;
  }
  private async fetchIncomingPayment(
    incomingPaymentId: string
  ): Promise<IncomingPayment | RemoteIncomingPayment | undefined> {
    return (
      (await this.incomingPaymentRepository.fetchById(incomingPaymentId)) ||
      (await this.remoteIncomingPaymentService.getById(incomingPaymentId))
    );
  }

  public async createQuote(request: CreateQuoteRequest): Promise<string> {
    let id: string;
    if (request.id) {
      const exists = await this.quoteRepository.exists(request.id);

      if (exists) {
        throw new DuplicateQuoteFoundError();
      }

      id = request.id;
    } else {
      id = crypto.randomUUID();
    }

    const [walletAddress, incomingPayment] = await Promise.all([
      this.walletAddressService.getById(request.senderWalletAddressId),
      this.fetchIncomingPayment(request.incomingPaymentId),
    ]);

    if (!walletAddress) {
      throw new WalletAddressNotFoundError();
    }

    if (!walletAddress.isActive) {
      throw new WalletAddressInactiveError();
    }

    if (!incomingPayment) {
      throw new IncomingPaymentNotFoundError();
    }

    return incomingPayment.type === "LOCAL"
      ? this.createLocalQuote(request, id, incomingPayment, walletAddress)
      : this.createRemoteQuote(request, id, incomingPayment, walletAddress);
  }

  public async createLocalQuote(
    request: CreateQuoteRequest,
    id: string,
    incomingPayment: IncomingPayment,
    walletAddress: WalletAddress
  ): Promise<string> {
    if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
      throw new IncomingPaymentInvalidStateError();
    }

    // We are assuming we don't care about how much has already been paid into
    // an incoming payment. Let the quote happen.

    let quoteReceiveAmount: Amount;
    let quoteDebitAmount: Amount;
    let exchangeRate: number;

    if (request.debitAmount) {
      const result = await this.calculateQuoteFromDebitAmount({
        debitAmount: request.debitAmount,
        walletAddress,
        incomingPayment,
      });

      quoteReceiveAmount = result.receiveAmount;
      exchangeRate = result.exchangeRate;
      quoteDebitAmount = request.debitAmount;
    } else if (request.receiveAmount) {
      const result = await this.calculateQuoteFromReceiveAmount({
        receiveAmount: request.receiveAmount,
        walletAddress,
        incomingPayment,
      });

      quoteDebitAmount = result.debitAmount;
      exchangeRate = result.exchangeRate;
      quoteReceiveAmount = request.receiveAmount;
    } else if (incomingPayment.incomingAmount) {
      const result = await this.calculateQuoteFromIncomingPaymentAmount({
        walletAddress,
        incomingPayment: {
          ...incomingPayment,
          incomingAmount: incomingPayment.incomingAmount,
        },
      });

      quoteDebitAmount = result.debitAmount;
      exchangeRate = result.exchangeRate;
      quoteReceiveAmount = {
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        value: incomingPayment.incomingAmount,
      };
    } else {
      throw new InvalidQuoteAmountError();
    }

    const quoteDefaultExpiryMs = new Date().getTime() + this.QUOTE_EXPIRY_MS;

    const newQuote: Quote = {
      id,
      receiveAmount: quoteReceiveAmount,
      debitAmount: quoteDebitAmount,
      senderWalletAddressId: walletAddress.id,
      incomingPaymentId: incomingPayment.id,
      exchangeRate,
      expiresAt: new Date(
        Math.min(incomingPayment.expiresAt.getTime(), quoteDefaultExpiryMs)
      ),
    };

    await this.quoteRepository.store(newQuote);

    return id;
  }

  public async createRemoteQuote(
    request: CreateQuoteRequest,
    id: string,
    incomingPayment: RemoteIncomingPayment,
    walletAddress: WalletAddress
  ): Promise<string> {
    // TODO: Do we need to check remote incoming payment here?

    const quoteDefaultExpiryMs = new Date().getTime() + this.QUOTE_EXPIRY_MS;

    // TODO: handle debit & receive amount
    const newQuote: Quote = {
      id,
      receiveAmount: request.debitAmount!,
      debitAmount: request.debitAmount!,
      senderWalletAddressId: walletAddress.id,
      incomingPaymentId: incomingPayment.id,
      exchangeRate: 1,
      expiresAt: new Date(quoteDefaultExpiryMs),
    };

    await this.quoteRepository.store(newQuote);

    const event: RemoteQuoteRequestedEvent = {
      type: PaymentEventType.REMOTE_QUOTE_REQUESTED,
      data: {
        quote: {
          id,
          debitAmount: request.debitAmount!,
          senderWalletAddressId: walletAddress.id,
        },
        incomingPayment,
      },
    };

    await this.paymentEventProducer.publish([event]);

    return id;
  }

  private async calculateQuoteFromDebitAmount({
    debitAmount,
    walletAddress,
    incomingPayment,
  }: {
    debitAmount: Amount;
    incomingPayment: IncomingPayment;
    walletAddress: WalletAddress;
  }): Promise<{
    exchangeRate: number;
    receiveAmount: Amount;
  }> {
    if (
      debitAmount.assetCode !== walletAddress.assetCode ||
      debitAmount.assetScale !== walletAddress.assetScale ||
      debitAmount.value <= 0n
    ) {
      throw new InvalidQuoteAmountError();
    }

    const isSameAssetQuote =
      debitAmount.assetCode === incomingPayment.asset.code;

    if (isSameAssetQuote) {
      const exchangeRate =
        10 ** (incomingPayment.asset.scale - debitAmount.assetScale);
      const receiveAmountValue = BigInt(
        Math.floor(Number(debitAmount.value) * exchangeRate)
      );

      return {
        receiveAmount: {
          assetCode: incomingPayment.asset.code,
          assetScale: incomingPayment.asset.scale,
          value: receiveAmountValue,
        },
        exchangeRate,
      };
    }

    const conversionResponse = await this.ratesService.convertFromSource({
      destinationAsset: incomingPayment.asset,
      sourceAmount: debitAmount.value,
      sourceAsset: {
        code: debitAmount.assetCode,
        scale: debitAmount.assetScale,
      },
    });

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError();
    }

    return {
      receiveAmount: {
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale,
        value: conversionResponse.destinationAmount,
      },
      exchangeRate: conversionResponse.exchangeRate,
    };
  }

  private async calculateQuoteFromReceiveAmount({
    receiveAmount,
    walletAddress,
    incomingPayment,
  }: {
    receiveAmount: Amount;
    incomingPayment: IncomingPayment;
    walletAddress: WalletAddress;
  }): Promise<{
    exchangeRate: number;
    debitAmount: Amount;
  }> {
    if (
      receiveAmount.assetCode !== incomingPayment.asset.code ||
      receiveAmount.assetScale !== incomingPayment.asset.scale ||
      receiveAmount.value <= 0n
    ) {
      throw new InvalidQuoteAmountError();
    }

    const isSameAssetQuote =
      receiveAmount.assetCode === walletAddress.assetCode;
    if (isSameAssetQuote) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2, may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (walletAddress.assetScale - receiveAmount.assetScale);
      const debitAmountValue = BigInt(
        Math.ceil(Number(receiveAmount.value) * exchangeRate)
      );

      return {
        debitAmount: {
          assetCode: walletAddress.assetCode,
          assetScale: walletAddress.assetScale,
          value: debitAmountValue,
        },
        exchangeRate,
      };
    }

    const conversionResponse = await this.ratesService.convertFromDestination({
      destinationAsset: incomingPayment.asset,
      destinationAmount: receiveAmount.value,
      sourceAsset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale,
      },
    });

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError();
    }

    return {
      debitAmount: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
        value: conversionResponse.sourceAmount,
      },
      exchangeRate: conversionResponse.exchangeRate,
    };
  }

  private async calculateQuoteFromIncomingPaymentAmount({
    walletAddress,
    incomingPayment,
  }: {
    incomingPayment: IncomingPayment & {
      incomingAmount: Pick<IncomingPayment, "incomingAmount">;
    };
    walletAddress: WalletAddress;
  }): Promise<{
    exchangeRate: number;
    debitAmount: Amount;
  }> {
    if (
      walletAddress.assetCode !== incomingPayment.asset.code ||
      walletAddress.assetScale !== incomingPayment.asset.scale
    ) {
      throw new InvalidQuoteAmountError();
    }

    if (incomingPayment.asset.code === walletAddress.assetCode) {
      // TODO: additional logic for making sure we can actually deliver the minimum amount of the receiving asset scale (e.g. sending from scale 4 to 2 may not satisfy a single unit of 2)
      const exchangeRate =
        10 ** (walletAddress.assetScale - incomingPayment.asset.scale);
      const debitAmountValue = BigInt(
        Math.ceil(Number(incomingPayment.incomingAmount) * exchangeRate)
      );

      return {
        debitAmount: {
          assetCode: walletAddress.assetCode,
          assetScale: walletAddress.assetScale,
          value: debitAmountValue,
        },
        exchangeRate,
      };
    }

    const conversionResponse = await this.ratesService.convertFromDestination({
      destinationAsset: incomingPayment.asset,
      destinationAmount: incomingPayment.incomingAmount,
      sourceAsset: {
        code: walletAddress.assetCode,
        scale: walletAddress.assetScale,
      },
    });

    if (!conversionResponse) {
      throw new CouldNotConvertExchangeRatesError();
    }

    return {
      debitAmount: {
        assetCode: walletAddress.assetCode,
        assetScale: walletAddress.assetScale,
        value: conversionResponse.sourceAmount,
      },
      exchangeRate: conversionResponse.exchangeRate,
    };
  }

  public async createOutgoingPaymentFromQuote(
    request: CreateOutgoingPaymentFromQuoteRequest
  ) {
    let outgoingPaymentId;

    if (request.id) {
      const exists = await this.outgoingPaymentRepository.exists(request.id);

      if (exists) {
        throw new DuplicateOutgoingPaymentFoundError();
      }
      outgoingPaymentId = request.id;
    } else {
      outgoingPaymentId = crypto.randomUUID();
    }

    const [walletAddress, quote] = await Promise.all([
      this.walletAddressService.getById(request.senderWalletAddressId),
      this.quoteRepository.fetchById(request.quoteId),
    ]);

    if (!walletAddress) {
      throw new WalletAddressNotFoundError();
    }

    if (!walletAddress.isActive) {
      throw new WalletAddressInactiveError();
    }

    if (!quote) {
      throw new QuoteNotFoundError();
    }

    // TODO: Check quote hasn't been used already

    if (quote.expiresAt <= new Date()) {
      throw new QuoteExpiredError();
    }

    const incomingPayment = await this.fetchIncomingPayment(
      quote.incomingPaymentId
    );

    if (!incomingPayment) {
      throw new IncomingPaymentNotFoundError();
    }

    if (incomingPayment.type === "LOCAL") {
      if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
        throw new IncomingPaymentInvalidStateError();
      }

      const walletAddressFundRequest: FundWalletAddressLiquidityRequest = {
        id: crypto.randomUUID(),
        type: LiquidityRequestType.FUND_WALLET_ADDRESS,
        data: {
          walletAddressId: quote.senderWalletAddressId,
          amount: quote.debitAmount,
        },
      };

      await this.liquidityService.execute([walletAddressFundRequest]);

      const outgoingPayment: OutgoingPayment = {
        id: outgoingPaymentId,
        quoteId: quote.id,
        senderWalletAddressId: walletAddress.id,
        asset: {
          code: walletAddress.assetCode,
          scale: walletAddress.assetScale,
        },
        debitAmount: quote.debitAmount.value,
        sentAmount: 0n,
        localIncomingPaymentId: incomingPayment.id,
        state: OutgoingPaymentState.FUNDED, // TODO: check if the outgoing payment request came from third party, and webhook out to ASE instead of marking as FUNDED directly
      };

      const localOutgoingPaymentFundedEvent: LocalOutgoingPaymentFundedEvent = {
        type: PaymentEventType.LOCAL_OUTGOING_PAYMENT_FUNDED,
        data: {
          outgoingPayment,
          incomingPayment,
          quote,
        },
      };

      await this.outgoingPaymentRepository.store(outgoingPayment);
      await this.paymentEventProducer.publish([
        localOutgoingPaymentFundedEvent,
      ]);

      return outgoingPayment.id;
    } else {
      const walletAddressFundRequest: FundWalletAddressLiquidityRequest = {
        id: crypto.randomUUID(),
        type: LiquidityRequestType.FUND_WALLET_ADDRESS,
        data: {
          walletAddressId: request.senderWalletAddressId,
          amount: quote.debitAmount,
        },
      };

      await this.liquidityService.execute([walletAddressFundRequest]);

      const outgoingPayment: OutgoingPayment = {
        id: crypto.randomUUID(),
        quoteId: quote.id,
        senderWalletAddressId: walletAddress.id,
        asset: {
          code: walletAddress.assetCode,
          scale: walletAddress.assetScale,
        },
        debitAmount: quote.debitAmount.value,
        sentAmount: 0n,
        remoteIncomingPaymentUrl: incomingPayment.id,
        state: "FUNDED",
      };
      await this.outgoingPaymentRepository.store(outgoingPayment);

      const remoteOutgoingPaymentFundedEvent: RemoteOutgoingPaymentFundedEvent =
        {
          type: PaymentEventType.REMOTE_OUTGOING_PAYMENT_FUNDED,
          data: {
            outgoingPaymentId: outgoingPayment.id,
            debitAmount: quote.debitAmount,
            receiveAmount: quote.receiveAmount,
            remoteIncomingPaymentUrl: outgoingPayment.remoteIncomingPaymentUrl!,
            quoteExpiresAt: quote.expiresAt,
            ilpDetails: incomingPayment.ilpDetails,
          },
        };

      await this.paymentEventProducer.publish([
        remoteOutgoingPaymentFundedEvent,
      ]);
      return outgoingPayment.id;
    }
  }

  public async createOutgoingPaymentFromIncomingPayment() {
    throw new Error("not implemented");
  }

  private addMicroPaymentToIncomingPayment(
    incomingPayment: IncomingPayment,
    microPayment: MicroPayment
  ): IncomingPaymentWithNewMicroPaymentUpdate {
    if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
      throw new IncomingPaymentCannotReceiveMicroPayment();
    }

    incomingPayment.receivedAmount += microPayment.amount; // received amount can be larger than incoming amount because of FX

    const update: IncomingPaymentWithNewMicroPaymentUpdate = {
      microPayment,
      receivedAmount: incomingPayment.receivedAmount,
    };

    if (
      incomingPayment.incomingAmount &&
      incomingPayment.receivedAmount >= incomingPayment.incomingAmount
    ) {
      incomingPayment.state = LocalIncomingPaymentState.COMPLETED;
      update.state = incomingPayment.state;
    }

    return update;
  }

  private addMicroPaymentToOutgoingPayment(
    outgoingPayment: OutgoingPayment,
    microPayment: MicroPayment
  ): OutgoingPaymentWithNewMicroPaymentUpdate {
    if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
      throw new OutgoingPaymentInvalidStateError();
    }

    outgoingPayment.sentAmount += microPayment.amount;

    const update: OutgoingPaymentWithNewMicroPaymentUpdate = {
      microPayment,
      sentAmount: microPayment.amount,
    };

    // TODO: determine whether this can/should happen
    if (outgoingPayment.sentAmount > outgoingPayment.debitAmount) {
      throw new OutgoingPaymentInvalidStateError();
    }

    if (outgoingPayment.sentAmount === outgoingPayment.debitAmount) {
      outgoingPayment.state = OutgoingPaymentState.COMPLETED;
      update.state = outgoingPayment.state;
    }

    return update;
  }

  // We can decide whether we want to keep this event or not, or just complete the outgoing payment synchronously in the payment handler,
  // in order to save one call to the liquidity service (we can fund the wallet address and make the wallet to wallet transfer directly in a single request)
  public async handleLocalOutgoingPaymentFundedEvent(
    event: LocalOutgoingPaymentFundedEvent
  ) {
    const { outgoingPayment, quote, incomingPayment } = event.data;

    const exists = await this.outgoingPaymentRepository.exists(
      outgoingPayment.id
    );

    if (!exists) throw new OutgoingPaymentNotFoundError();

    // TODO: FX handling, if receiving wallet asset is different than sending wallet
    const transferRequest: WalletToWalletAddressLiquidityRequest = {
      id: crypto.randomUUID(),
      type: LiquidityRequestType.WALLET_ADDRESS_TO_WALLET_ADDRESS,
      data: {
        sourceWalletAddressId: quote.senderWalletAddressId,
        sourceAmount: quote.debitAmount,
        destinationWalletAddressId: incomingPayment.walletAddressId,
        destinationAmount: quote.receiveAmount,
      },
    };

    await this.liquidityService.execute([transferRequest]);

    const outgoingPaymentUpdate = this.addMicroPaymentToOutgoingPayment(
      outgoingPayment,
      {
        requestId: outgoingPayment.id,
        amount: outgoingPayment.debitAmount,
        method: "LOCAL",
      }
    );

    const events: Event[] = [];

    const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
      type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED,
      data: {
        outgoingPayment,
      },
    };

    events.push(outgoingPaymentCompletedEvent);

    const incomingPaymentUpdate = this.addMicroPaymentToIncomingPayment(
      incomingPayment,
      {
        requestId: outgoingPayment.id,
        amount: quote.receiveAmount.value, // TODO: need to send _up to_ to incomingAmount, as the quoted amount might be more
        method: "LOCAL",
      }
    );

    // MicroPayment might have completed the incoming payment
    if (incomingPayment.state === LocalIncomingPaymentState.COMPLETED) {
      const incomingPaymentCompletedEvent: IncomingPaymentCompletedEvent = {
        type: PaymentEventType.INCOMING_PAYMENT_COMPLETED,
        data: {
          incomingPayment,
        },
      };
      events.push(incomingPaymentCompletedEvent);
    }

    await Promise.all([
      this.outgoingPaymentRepository.updateWithNewMicroPayment(
        outgoingPayment,
        outgoingPaymentUpdate
      ),
      this.incomingPaymentRepository.updateWithNewMicroPayment(
        incomingPayment,
        incomingPaymentUpdate
      ),
    ]);

    await this.paymentEventProducer.publish(events);
    this.telemetryService.incrementCounter("outgoing_payments_completed", 1);
  }

  public async handleIlpPaymentFulfillPacketReceivedEvent(
    event: IlpPaymentFulfillPacketReceivedEvent
  ) {
    const outgoingPayment = await this.outgoingPaymentRepository.fetchById(
      event.data.outgoingPaymentId
    );

    if (!outgoingPayment) {
      throw new OutgoingPaymentNotFoundError();
    }

    if (outgoingPayment.state !== OutgoingPaymentState.FUNDED) {
      throw new OutgoingPaymentInvalidStateError();
    }

    if (event.data.amount.assetCode === outgoingPayment.asset.code) {
      // We lost precision
      if (event.data.amount.assetScale > outgoingPayment.asset.scale) {
        throw new OutgoingPaymentInvalidStateError();
      }

      const transfer: WalletAddressToPeerLiquidityRequest = {
        id: event.data.requestId,
        type: LiquidityRequestType.WALLET_ADDRESS_TO_PEER,
        data: {
          peerId: event.data.peerId,
          walletAddressId: outgoingPayment.senderWalletAddressId,
          amount: event.data.amount,
        },
      };

      await this.liquidityService.execute([transfer]);

      const scaledRate = BigInt(
        10 ** (outgoingPayment.asset.scale - event.data.amount.assetScale)
      );

      const microPayment: MicroPayment = {
        requestId: event.data.requestId,
        ilpPeerId: event.data.peerId,
        amount: event.data.amount.value * scaledRate,
        method: "ILP",
      };

      const update = this.addMicroPaymentToOutgoingPayment(
        outgoingPayment,
        microPayment
      );

      const events: Event[] = [];

      // TODO: do we need to know whether the incoming payment was completed? Or we just need to know that the connection was done/closed?
      // or do we just check the status of the micro

      if (
        // @ts-ignore
        outgoingPayment.state === OutgoingPaymentState.COMPLETED || // Micropayment could have completed payment
        event.data.didCompleteIncomingPayment
      ) {
        outgoingPayment.state = OutgoingPaymentState.COMPLETED;

        const outgoingPaymentCompletedEvent: OutgoingPaymentCompletedEvent = {
          type: PaymentEventType.OUTGOING_PAYMENT_COMPLETED,
          data: {
            outgoingPayment,
          },
        };
        events.push(outgoingPaymentCompletedEvent);
      }

      await this.outgoingPaymentRepository.updateWithNewMicroPayment(
        outgoingPayment,
        update
      );
      await this.paymentEventProducer.publish(events);
      this.telemetryService.incrementCounter("outgoing_payments_completed", 1);
    } else {
      throw new Error("FX during packet handling not implemented");
    }
  }

  public async handleIlpPaymentPreparePacketReceivedEvent(
    event: IlpPaymentPreparePacketReceivedEvent
  ) {
    const peer = await this.ilpPeerService.getById(event.data.peerId);

    if (!peer) {
      throw new PeerNotFoundError();
    }

    const incomingPayment = await this.incomingPaymentRepository.fetchById(
      event.data.incomingPaymentId
    );

    if (!incomingPayment) {
      // TODO: Send a packet reject event
      throw new IncomingPaymentNotFoundError();
    }

    if (incomingPayment.state !== LocalIncomingPaymentState.CREATED) {
      // TODO: Send a packet reject event
      throw new IncomingPaymentInvalidStateError();
    }

    if (peer.asset.code === incomingPayment.asset.code) {
      if (peer.asset.scale > incomingPayment.asset.scale) {
        throw new IncomingPaymentInvalidStateError();
      }

      const transfer: PeerToWalletAddressLiquidityRequest = {
        id: event.data.requestId,
        type: LiquidityRequestType.PEER_TO_WALLET_ADDRESS,
        data: {
          peerId: event.data.peerId,
          walletAddressId: incomingPayment.walletAddressId,
          amount: {
            assetCode: peer.asset.code,
            assetScale: peer.asset.scale,
            value: event.data.amount,
          },
        },
      };

      await this.liquidityService.execute([transfer]);

      const scaledRate = BigInt(
        10 ** (incomingPayment.asset.scale - peer.asset.scale)
      );

      const microPaymentAmount = event.data.amount * scaledRate;

      const update = this.addMicroPaymentToIncomingPayment(incomingPayment, {
        requestId: event.data.requestId,
        ilpPeerId: event.data.peerId,
        amount: microPaymentAmount,
        method: "ILP",
      });

      await this.incomingPaymentRepository.updateWithNewMicroPayment(
        incomingPayment,
        update
      );

      const paymentEvents: Event[] = [];

      const incomingPaymentCompleted =
        // @ts-ignore
        incomingPayment.state === LocalIncomingPaymentState.COMPLETED;

      if (incomingPaymentCompleted) {
        const incomingPaymentCompletedEvent: IncomingPaymentCompletedEvent = {
          type: PaymentEventType.INCOMING_PAYMENT_COMPLETED,
          data: {
            incomingPayment,
          },
        };

        paymentEvents.push(incomingPaymentCompletedEvent);
      }

      const ilpPaymentPreparePacketAcceptedEvent: IlpPaymentPreparePacketAcceptedEvent =
        {
          type: PaymentEventType.ILP_PAYMENT_PREPARE_PACKET_ACCEPTED,
          data: {
            amount: {
              assetCode: incomingPayment.asset.code,
              assetScale: incomingPayment.asset.scale,
              value: microPaymentAmount,
            },
            incomingPaymentCompleted,
            requestId: event.data.requestId,
          },
        };

      paymentEvents.push(ilpPaymentPreparePacketAcceptedEvent);

      await this.paymentEventProducer.publish(paymentEvents);
    } else {
      throw new Error("FX during packet handling not implemented");
    }
  }

  public async handleIlpQuotePacketReceived(
    event: IlpQuotePacketReceivedEvent
  ): Promise<void> {
    const exists = await this.quoteRepository.exists(event.data.quoteId);

    if (!exists) {
      throw new QuoteNotFoundError();
    }

    await this.quoteRepository.updateAmounts({
      id: event.data.quoteId,
      amount: event.data.amount,
    });
  }
}
