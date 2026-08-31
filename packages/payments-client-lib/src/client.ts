import * as grpc from '@grpc/grpc-js';
import { ServiceError, status } from '@grpc/grpc-js';
import { randomUUID } from 'node:crypto';
import { createServiceError } from './errors';
import { IAmount } from './local-types';
import {
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  CompletePaymentIntentRequest,
  CompletePaymentIntentResponse,
  PaymentsGrpcClient,
  CreateQuoteRequest,
  CreateQuoteResponse,
  CreatePaymentRequest,
  CreatePaymentResponse,
  ApprovePaymentRequest,
  ApprovePaymentResponse,
  GetPaymentIntentRequest,
  GetPaymentRequest,
  Amount,
  PaymentIntent,
  Payment,
  CancelPaymentRequest,
  CancelPaymentResponse
} from 'payments-public-types-lib';

type IncomingPaymentInput =
  | { incomingPaymentId: string }
  | { incomingPaymentUrl: string };

export type PaymentIntentResult = Omit<
  PaymentIntent.AsObject,
  'receivedAmount' | 'incomingAmount'
> & {
  receivedAmount: bigint;
  incomingAmount: bigint | undefined;
};

export type PaymentResult = Omit<
  Payment.AsObject,
  'debitAmount' | 'receiveAmount' | 'sentAmount'
> & {
  debitAmount: IAmount;
  receiveAmount: IAmount;
  sentAmount: IAmount;
};

export class PaymentsClient {
  private readonly _serverUrl: string;
  private readonly _grpcConnectTimeOutMs: number;
  private readonly _grpcClient: PaymentsGrpcClient;
  private readonly _openPaymentsUrl: string | undefined;

  /**
   * @param openPaymentsUrl - Base URL of this node's Open Payments server (e.g. https://payments.example.com).
   *   Required for remote quoting and payments; may omit for local-only use.
   */
  constructor(
    serverUrl: string,
    grpcConnectTimeOutMs: number = 5_000,
    openPaymentsUrl?: string
  ) {
    this._serverUrl = serverUrl;
    this._grpcConnectTimeOutMs = grpcConnectTimeOutMs;
    this._openPaymentsUrl = openPaymentsUrl;

    this._grpcClient = new PaymentsGrpcClient(
      this._serverUrl,
      grpc.credentials.createInsecure(),
      {
        'grpc.max_receive_message_length': 100 * 1024 * 1024,
        'grpc.max_send_message_length': 100 * 1024 * 1024,
        'grpc.keepalive_time_ms': 10000,
        'grpc.keepalive_timeout_ms': 5000,
        'grpc.keepalive_permit_without_calls': 1
      }
    );
  }

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline: grpc.Deadline = Date.now() + this._grpcConnectTimeOutMs;
      this._grpcClient.waitForReady(deadline, (error?: Error) => {
        if (error) return reject(error);
        return resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    this._grpcClient.close();
    return Promise.resolve();
  }

  async createPaymentIntent(
    id: string,
    receiverWalletAddressId: string,
    receiverWalletAddress: string,
    incomingAmount?: number,
    expiresAt?: string,
    metadata?: string
  ): Promise<CreatePaymentIntentResponse.AsObject> {
    const request = new CreatePaymentIntentRequest();
    request.setId(id);
    request.setWalletAddressId(receiverWalletAddressId);
    request.setWalletAddress(receiverWalletAddress);

    if (incomingAmount !== undefined) {
      request.setIncomingAmount(incomingAmount);
    }
    if (expiresAt !== undefined) {
      request.setExpiresAt(expiresAt);
    }
    if (metadata !== undefined) {
      request.setMetadata(metadata);
    }

    return new Promise((resolve, reject) => {
      this._grpcClient.createPaymentIntent(
        request,
        (error: ServiceError | null, response: CreatePaymentIntentResponse) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve({
            id: response.getId()
          });
        }
      );
    });
  }

  async completePaymentIntent(
    id: string
  ): Promise<CompletePaymentIntentResponse.AsObject> {
    const request = new CompletePaymentIntentRequest();
    request.setId(id);

    return new Promise((resolve, reject) => {
      this._grpcClient.completePaymentIntent(
        request,
        (
          error: ServiceError | null,
          response: CompletePaymentIntentResponse
        ) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve({
            id: response.getId(),
            state: response.getState()
          });
        }
      );
    });
  }

  async createQuote(
    id: string,
    incomingPayment: IncomingPaymentInput,
    senderWalletAddressId: string,
    senderWalletAddress: string,
    debitAmount?: number,
    receiveAmount?: number
  ): Promise<
    Omit<CreateQuoteResponse.AsObject, 'debitAmount' | 'receiveAmount'> & {
      debitAmount: bigint;
      receiveAmount: bigint;
    }
  > {
    let paymentIntentId: string;
    let remoteUrl: string | undefined;

    if ('incomingPaymentUrl' in incomingPayment) {
      if (!this._openPaymentsUrl) {
        throw createServiceError(
          status.FAILED_PRECONDITION,
          'Remote quoting is currently not configured',
          'RemoteQuotingNotConfigured'
        );
      }
      if (
        incomingPayment.incomingPaymentUrl.startsWith(this._openPaymentsUrl)
      ) {
        paymentIntentId = incomingPayment.incomingPaymentUrl.split('/').at(-1)!;
      } else {
        paymentIntentId = randomUUID();
        remoteUrl = incomingPayment.incomingPaymentUrl;
      }
    } else {
      paymentIntentId = incomingPayment.incomingPaymentId;
    }

    const request = new CreateQuoteRequest();
    request.setId(id);
    request.setWalletAddressId(senderWalletAddressId);
    request.setWalletAddress(senderWalletAddress);
    request.setPaymentIntentId(paymentIntentId);

    if (debitAmount) {
      request.setDebitAmount(debitAmount);
    }
    if (receiveAmount) {
      request.setReceiveAmount(receiveAmount);
    }
    if (remoteUrl) {
      request.setRemoteUrl(remoteUrl);
    }

    return new Promise((resolve, reject) => {
      this._grpcClient.createQuote(
        request,
        (error: ServiceError | null, response: CreateQuoteResponse) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve({
            id: response.getId(),
            paymentIntentId: response.getPaymentIntentId(),
            senderWalletAddress: response.getSenderWalletAddress(),
            senderWalletAddressId: response.getSenderWalletAddressId(),
            expiresAt: response.getExpiresAt(),
            debitAmount: BigInt(response.getDebitAmount()),
            receiveAmount: BigInt(response.getReceiveAmount()),
            exchangeRate: response.getExchangeRate()
          });
        }
      );
    });
  }

  async createPayment(
    id: string,
    walletAddressId: string,
    walletAddress: string,
    paymentIntentId: string,
    quoteId?: string,
    debitAmount?: number
  ): Promise<CreatePaymentResponse.AsObject> {
    const request = new CreatePaymentRequest();
    request.setId(id);
    request.setWalletAddressId(walletAddressId);
    request.setWalletAddress(walletAddress);
    request.setPaymentIntentId(paymentIntentId);

    if (quoteId) {
      request.setQuoteId(quoteId);
    }

    if (debitAmount) {
      request.setDebitAmount(debitAmount);
    }

    return new Promise((resolve, reject) => {
      this._grpcClient.createPayment(
        request,
        (error: ServiceError | null, response: CreatePaymentResponse) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve({
            id: response.getId()
          });
        }
      );
    });
  }

  async approvePayment(
    paymentIntentId: string,
    id: string
  ): Promise<ApprovePaymentResponse.AsObject> {
    const request = new ApprovePaymentRequest();
    request.setId(id);
    request.setPaymentIntentId(paymentIntentId);

    return new Promise((resolve, reject) => {
      this._grpcClient.approvePayment(
        request,
        (error: ServiceError | null, response: ApprovePaymentResponse) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve({
            id: response.getId(),
            state: response.getState()
          });
        }
      );
    });
  }

  async cancelPayment(
    paymentIntentId: string,
    id: string,
    reason?: string
  ): Promise<CancelPaymentResponse.AsObject> {
    const request = new CancelPaymentRequest();
    request.setId(id);
    request.setPaymentIntentId(paymentIntentId);
    if (reason) {
      request.setReason(reason);
    }

    return new Promise((resolve, reject) => {
      this._grpcClient.cancelPayment(
        request,
        (error: ServiceError | null, response: CancelPaymentResponse) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve({
            id: response.getId()
          });
        }
      );
    });
  }

  async getPaymentIntent(id: string): Promise<PaymentIntentResult> {
    const request = new GetPaymentIntentRequest();
    request.setId(id);

    return new Promise((resolve, reject) => {
      this._grpcClient.getPaymentIntent(
        request,
        (error: ServiceError | null, response: PaymentIntent) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve(PaymentsClient._paymentIntentFromPb(response));
        }
      );
    });
  }

  async getPayment(
    paymentIntentId: string,
    id: string
  ): Promise<PaymentResult> {
    const request = new GetPaymentRequest();
    request.setId(id);
    request.setPaymentIntentId(paymentIntentId);

    return new Promise((resolve, reject) => {
      this._grpcClient.getPayment(
        request,
        (error: ServiceError | null, response: Payment) => {
          if (error) {
            console.error(error);
            return reject(error);
          }

          return resolve(PaymentsClient._paymentFromPb(response));
        }
      );
    });
  }

  private static _paymentIntentFromPb(
    response: PaymentIntent
  ): PaymentIntentResult {
    const incomingAmount = response.getIncomingAmount();
    const expiresAt = response.getExpiresAt();
    const destinationIlpAddress = response.getDestinationIlpAddress();

    return {
      id: response.getId(),
      receiverWalletAddress: response.getReceiverWalletAddress(),
      state: response.getState(),
      destination: response.getDestination(),
      receivedAmount: BigInt(response.getReceivedAmount()),
      assetCode: response.getAssetCode(),
      assetScale: response.getAssetScale(),
      incomingAmount: incomingAmount ? BigInt(incomingAmount) : undefined,
      expiresAt: expiresAt || undefined,
      destinationIlpAddress: destinationIlpAddress || undefined,
      createdAt: response.getCreatedAt()
    };
  }

  private static _paymentFromPb(response: Payment): PaymentResult {
    const quoteId = response.getQuoteId();
    const remoteUrl = response.getRemoteUrl();
    const failReason = response.getFailReason();

    return {
      id: response.getId(),
      state: response.getState(),
      senderWalletAddress: response.getSenderWalletAddress(),
      senderWalletAddressId: response.getSenderWalletAddressId(),
      paymentIntentId: response.getPaymentIntentId(),
      quoteId: quoteId || undefined,
      debitAmount: PaymentsClient._amountFromPb(
        response.getDebitAmount(),
        'debitAmount'
      ),
      receiveAmount: PaymentsClient._amountFromPb(
        response.getReceiveAmount(),
        'receiveAmount'
      ),
      sentAmount: PaymentsClient._amountFromPb(
        response.getSentAmount(),
        'sentAmount'
      ),
      createdAt: response.getCreatedAt(),
      remoteUrl: remoteUrl || undefined,
      failReason: failReason || undefined
    };
  }

  private static _amountFromPb(
    pbAmount: Amount | undefined,
    field: string
  ): IAmount {
    if (!pbAmount) {
      throw createServiceError(
        status.INTERNAL,
        `Missing '${field}' on payment response`
      );
    }
    return {
      value: BigInt(pbAmount.getValue()),
      assetCode: pbAmount.getAssetCode(),
      assetScale: pbAmount.getAssetScale()
    };
  }
}
