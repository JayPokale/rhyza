import { IPaymentIntent, WalletAddress } from './interfaces';
import { PaymentIntentEntity } from './entity';
import { CreatePaymentIntentCmdPayload } from '../commands';
import {
  CannotCreateDuplicatePaymentIntentError,
  WalletAddressNotFoundError,
  WalletAddressInactiveError,
  InvalidPaymentIntentExpiryError
} from './errors';
import {
  PaymentIntentCreatedEvent,
  PaymentIntentCreateFailedEvent
} from './events';

const DEFAULT_EXPIRY_MS = 1000 * 60 * 10; // 10 minutes
const MAX_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export class PaymentIntentAggregate {
  create(
    payload: CreatePaymentIntentCmdPayload,
    walletMap: Map<string, WalletAddress>,
    seenIds: Set<string>,
    requestId?: string
  ): {
    entity: IPaymentIntent;
    event: PaymentIntentCreatedEvent;
  } {
    const { id, walletAddressId, expiresAt, incomingAmount } = payload;

    if (seenIds.has(id)) {
      throw new CannotCreateDuplicatePaymentIntentError(
        `Payment intent with id ${id} already exists`
      );
    }

    const wallet = walletMap.get(walletAddressId);
    if (!wallet) {
      throw new WalletAddressNotFoundError(
        `Wallet address ${walletAddressId} not found`
      );
    }
    if (!wallet.isActive) {
      throw new WalletAddressInactiveError(
        `Wallet address ${walletAddressId} is not active`
      );
    }

    // TODO: Validate asset match if incomingAmount provided?
    // Currently incomingAmount on the command is currently a bare number.
    // Keep and use wallet address asset? Or require as means of confirming
    // the sender understands the asset to be used?
    // - v1 Rafiki requires it to be passed in

    const resolvedExpiresAt = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + DEFAULT_EXPIRY_MS);

    if (resolvedExpiresAt.getTime() <= Date.now()) {
      throw new InvalidPaymentIntentExpiryError(
        'expiresAt must be in the future'
      );
    }
    if (resolvedExpiresAt.getTime() > Date.now() + MAX_EXPIRY_MS) {
      throw new InvalidPaymentIntentExpiryError(
        'expiresAt must be within 30 days'
      );
    }

    const entity = new PaymentIntentEntity(
      id,
      walletAddressId,
      wallet.assetCode,
      wallet.assetScale,
      resolvedExpiresAt,
      incomingAmount != null ? BigInt(incomingAmount) : null
    ).toObject();

    const event = new PaymentIntentCreatedEvent({ id }, requestId);

    return { entity, event };
  }
}
