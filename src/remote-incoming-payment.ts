import { IlpDetails } from "./ilp-connector";
import logger from "./logger";
import { Repository } from "./repository";
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

interface RemoteIncomingPaymentRepository
  extends Repository<RemoteIncomingPayment> {}

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
