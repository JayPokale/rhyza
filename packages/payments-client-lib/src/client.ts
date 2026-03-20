import * as grpc from '@grpc/grpc-js';
import { ServiceError } from '@grpc/grpc-js';
import {
  ICreateIncomingPaymentResponse,
  ICreateQuoteResponse,
  ICreateOutgoingPaymentResponse,
  IApproveOutgoingPaymentResponse
} from './local-types';
import {
  CreateIncomingPaymentRequest,
  CreateIncomingPaymentResponse,
  PaymentsGrpcClient,
  CreateQuoteRequest,
  CreateQuoteResponse,
  CreateOutgoingPaymentRequest,
  CreateOutgoingPaymentResponse,
  ApproveOutgoingPaymentRequest,
  ApproveOutgoingPaymentResponse
} from 'payments-public-types-lib';

export class PaymentsClient {
  private readonly _serverUrl: string;
  private readonly _grpcConnectTimeOutMs: number;
  private readonly _grpcClient: PaymentsGrpcClient;

  constructor(serverUrl: string, grpcConnectTimeOutMs: number = 5_000) {
    this._serverUrl = serverUrl;
    this._grpcConnectTimeOutMs = grpcConnectTimeOutMs;

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

  async createIncomingPayment(
    id: string,
    receiverWalletAddressId: string,
    receiverWalletAddress: string,
    incomingAmount?: number,
    expiresAt?: string,
    metadata?: string
  ): Promise<ICreateIncomingPaymentResponse> {
    const request = new CreateIncomingPaymentRequest();
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
      this._grpcClient.createIncomingPayment(
        request,
        (
          error: ServiceError | null,
          response: CreateIncomingPaymentResponse
        ) => {
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

  async createQuote(
    id: string,
    incomingPaymentId: string,
    senderWalletAddressId: string,
    senderWalletAddress: string,
    debitAmount?: number,
    receiveAmount?: number
  ): Promise<ICreateQuoteResponse> {
    const request = new CreateQuoteRequest();
    request.setId(id);
    request.setWalletAddressId(senderWalletAddressId);
    request.setWalletAddress(senderWalletAddress);
    request.setIncomingPaymentId(incomingPaymentId);

    if (debitAmount) {
      request.setDebitAmount(debitAmount);
    }
    if (receiveAmount) {
      request.setReceiveAmount(receiveAmount);
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
            id: response.getId()
          });
        }
      );
    });
  }

  async createOutgoingPayment(
    id: string,
    walletAddressId: string,
    walletAddress: string,
    incomingPaymentId: string,
    quoteId?: string,
    debitAmount?: number
  ): Promise<ICreateOutgoingPaymentResponse> {
    const request = new CreateOutgoingPaymentRequest();
    request.setId(id);
    request.setWalletAddressId(walletAddressId);
    request.setWalletAddress(walletAddress);
    request.setIncomingPaymentId(incomingPaymentId);

    if (quoteId) {
      request.setQuoteId(quoteId);
    }

    if (debitAmount) {
      request.setDebitAmount(debitAmount);
    }

    return new Promise((resolve, reject) => {
      this._grpcClient.createOutgoingPayment(
        request,
        (
          error: ServiceError | null,
          response: CreateOutgoingPaymentResponse
        ) => {
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

  async approveOutgoingPayment(
    id: string,
    incomingPaymentId: string
  ): Promise<IApproveOutgoingPaymentResponse> {
    const request = new ApproveOutgoingPaymentRequest();
    request.setId(id);
    request.setIncomingPaymentId(incomingPaymentId);

    return new Promise((resolve, reject) => {
      this._grpcClient.approveOutgoingPayment(
        request,
        (
          error: ServiceError | null,
          response: ApproveOutgoingPaymentResponse
        ) => {
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
}
