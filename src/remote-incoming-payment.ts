import { Pool } from "pg";
import { IlpDetails } from "./ilp-connector";
import logger from "./logger";
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

interface CreateRemoteIncomingPaymentArgs {
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
    const { expiresAt, incomingAmount, walletAddressId, resourceServerUrl } =
      args;

    // TODO: Open Payments client
    let res;
    try {
      res = await fetch(`${resourceServerUrl}/incoming-payment`, {
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
    } catch (err) {
      logger.error("Error creating incoming payment at remote", {
        walletAddressId,
        resourceServerUrl,
        err,
      });
    }

    if (!res!.ok) {
      const errorMessage =
        "Got non 2XX response when creating incoming payment";
      logger.error(
        {
          walletAddressId,
          resourceServerUrl,
          status: res!.status,
        },
        errorMessage
      );

      throw new Error(errorMessage);
    }

    const remoteIncomingPayment = (await res!.json()) as RemoteIncomingPayment;

    await this.remoteIncomingPaymentRepository.store(remoteIncomingPayment);

    return remoteIncomingPayment.id;
  }

  public async getById(id: string): Promise<RemoteIncomingPayment | undefined> {
    return this.remoteIncomingPaymentRepository.fetchById(id);
  }
}

interface RemoteIncomingPaymentRecord {
  id: string;
  expires_at: string;
  asset_code: string;
  asset_scale: number;
  incoming_amount: string | null;
  received_amount: string;
  ilp_destination_address: string;
  ilp_shared_secret: string;
}
export class RemoteIncomingPaymentPsqlRepository
  implements RemoteIncomingPaymentRepository
{
  TABLE_NAME = "remote_incoming_payments";
  constructor(private pool: Pool) {}

  public async store(
    remoteIncomingPayment: RemoteIncomingPayment
  ): Promise<void> {
    try {
      const query = `
        INSERT INTO ${this.TABLE_NAME} (id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, ilp_destination_address, ilp_shared_secret)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

      const values = [
        remoteIncomingPayment.id,
        remoteIncomingPayment.expiresAt.toISOString(),
        remoteIncomingPayment.asset.code,
        remoteIncomingPayment.asset.scale,
        remoteIncomingPayment.incomingAmount
          ? remoteIncomingPayment.incomingAmount.toString()
          : null,
        remoteIncomingPayment.receivedAmount.toString(),
        remoteIncomingPayment.ilpDetails.destinationAddress,
        remoteIncomingPayment.ilpDetails.sharedSecret,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error("Error storing remote incoming payment:", error);
      throw error;
    }
  }

  public async fetchById(
    id: string
  ): Promise<RemoteIncomingPayment | undefined> {
    const res = await this.pool.query<RemoteIncomingPaymentRecord>(
      `SELECT id, expires_at, asset_code, asset_scale, incoming_amount, received_amount, ilp_destination_address, ilp_shared_secret FROM ${this.TABLE_NAME} WHERE id = $1`,
      [id]
    );

    if (res.rows.length === 0) return undefined;

    const row = res.rows[0];

    return {
      id: row.id,
      expiresAt: new Date(row.expires_at),
      asset: {
        code: row.asset_code,
        scale: row.asset_scale,
      },
      incomingAmount: row.incoming_amount
        ? BigInt(row.incoming_amount)
        : undefined,
      receivedAmount: BigInt(row.received_amount),
      type: "REMOTE",
      ilpDetails: {
        destinationAddress: row.ilp_destination_address,
        sharedSecret: row.ilp_shared_secret,
      },
    };
  }
}
