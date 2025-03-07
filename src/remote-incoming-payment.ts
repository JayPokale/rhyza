import { Pool } from "pg";
import { IlpDetails } from "./ilp-connector";
import { Amount, Asset } from "./shared";

export interface RemoteIncomingPayment {
  id: string;
  expiresAt: Date;
  asset: Asset;
  incomingAmount?: bigint;
  receivedAmount: bigint;
  type: "REMOTE";
  ilpDetails: IlpDetails;
}

export interface CreateRemoteIncomingPaymentArgs {
  resourceServerUrl: string;
  expiresAt?: Date;
  incomingAmount?: Amount;
  walletAddressId: string;
}

export interface RemoteIncomingPaymentServiceAdapter {
  createRemoteIncomingPayment(
    args: CreateRemoteIncomingPaymentArgs
  ): Promise<string>;
  getById(id: string): Promise<RemoteIncomingPayment | undefined>;
}

export interface RemoteIncomingPaymentRepository {
  store(payment: RemoteIncomingPayment): Promise<void>;
  fetchById(id: string): Promise<RemoteIncomingPayment | undefined>;
}

export class RemoteIncomingPaymentInMemoryRepository
  implements RemoteIncomingPaymentRepository
{
  private map: Map<string, RemoteIncomingPayment> = new Map();

  public async store(payment: RemoteIncomingPayment): Promise<void> {
    this.map.set(payment.id, payment);
  }

  public async fetchById(
    id: string
  ): Promise<RemoteIncomingPayment | undefined> {
    return this.map.get(id);
  }
}

export class RemoteIncomingPaymentService
  implements RemoteIncomingPaymentServiceAdapter
{
  constructor(
    private remoteIncomingPaymentRepository: RemoteIncomingPaymentRepository
  ) {}

  public async createRemoteIncomingPayment(
    args: CreateRemoteIncomingPaymentArgs
  ): Promise<string> {
    const { expiresAt, incomingAmount, walletAddressId } = args;

    // TODO: Open Payments client
    const res = await fetch(args.resourceServerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        walletAddressId,
        expiresAt,
        ...(incomingAmount
          ? {
              assetScale: incomingAmount.assetScale,
              assetCode: incomingAmount.assetCode,
              value: incomingAmount.value,
            }
          : {}),
      }),
    });

    const remoteIncomingPayment = (await res.json()) as RemoteIncomingPayment;

    await this.remoteIncomingPaymentRepository.store(remoteIncomingPayment);

    return remoteIncomingPayment.id;
  }

  public async getById(id: string): Promise<RemoteIncomingPayment | undefined> {
    return this.remoteIncomingPaymentRepository.fetchById(id);
  }
}
