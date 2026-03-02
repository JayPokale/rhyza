import { Message } from 'common-types-lib';
import {
  IIncomingPayment,
  IIncomingPaymentRepository,
  IWalletAddressPort,
  WalletAddress
} from './interfaces';
import { IncomingPaymentEntity } from './entity';
import { CreateIncomingPaymentCmd } from '../commands';
import {
  CannotCreateDuplicateIncomingPaymentError,
  WalletAddressNotFoundError,
  WalletAddressInactiveError,
  InvalidIncomingPaymentExpiryError
} from './errors';
import {
  IncomingPaymentCreatedEvent,
  IncomingPaymentCreateFailedEvent
} from './events';

const DEFAULT_EXPIRY_MS = 1000 * 60 * 10; // 10 minutes
const MAX_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export class IncomingPaymentAggregate {
  private _repo: IIncomingPaymentRepository;
  private _walletAddressPort: IWalletAddressPort;

  constructor(
    repo: IIncomingPaymentRepository,
    walletAddressPort: IWalletAddressPort
  ) {
    this._repo = repo;
    this._walletAddressPort = walletAddressPort;
  }

  async handleBatch(cmds: Message[]): Promise<Message[]> {
    const outputEvents: Message[] = [];
    const newPayments: IIncomingPayment[] = [];

    // Pre-fetch unique wallet address and payment IDs
    const walletIdSet = new Set<string>();
    const paymentIds: string[] = [];
    for (const cmd of cmds) {
      if (cmd.msgName === CreateIncomingPaymentCmd.name) {
        const payload = (cmd as CreateIncomingPaymentCmd).payload;
        walletIdSet.add(payload.walletAddressId);
        paymentIds.push(payload.id);
      }
    }

    const [walletsArr, existingPayments] = await Promise.all([
      this._walletAddressPort.fetchByIds([...walletIdSet]),
      this._repo.fetchByIds(paymentIds)
    ]);

    // Build wallet map for direct access
    const walletMap = new Map<string, WalletAddress>();
    for (const w of walletsArr) {
      walletMap.set(w.id, w);
    }

    // Seed seenIds with existing DB payments - add newly processesd ones as we go
    const seenIds = new Set<string>(existingPayments.map((p) => p.id));

    // Process each command
    for (const cmd of cmds) {
      if (cmd.msgName === CreateIncomingPaymentCmd.name) {
        const typedCmd = cmd as CreateIncomingPaymentCmd;
        try {
          const payment = this._createIncomingPayment(
            typedCmd,
            walletMap,
            seenIds
          );
          newPayments.push(payment);
          seenIds.add(typedCmd.payload.id);
          outputEvents.push(
            new IncomingPaymentCreatedEvent(
              { id: typedCmd.payload.id },
              typedCmd.requestId
            )
          );
        } catch (e) {
          outputEvents.push(
            new IncomingPaymentCreateFailedEvent(
              {
                errorName: (e as Error).constructor.name,
                message: (e as Error).message
              },
              typedCmd.requestId
            )
          );
          continue;
        }
      }
    }

    // Flush: one round-trip for all new payments
    if (newPayments.length > 0) {
      await this._repo.storeMany(newPayments);
    }

    return outputEvents;
  }

  private _createIncomingPayment(
    cmd: CreateIncomingPaymentCmd,
    walletsByIdMap: Map<string, WalletAddress>,
    existingPaymentIds: Set<string>
  ): IIncomingPayment {
    const { id, walletAddressId, expiresAt, incomingAmount } = cmd.payload;

    if (existingPaymentIds.has(id)) {
      throw new CannotCreateDuplicateIncomingPaymentError(
        `Incoming payment with id ${id} already exists`
      );
    }

    const wallet = walletsByIdMap.get(walletAddressId);
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
    // the sender understandts the asset to be used?
    // - v1 Rafiki requires it to be passed in

    const resolvedExpiresAt = expiresAt
      ? new Date(expiresAt)
      : new Date(Date.now() + DEFAULT_EXPIRY_MS);

    if (resolvedExpiresAt.getTime() <= Date.now()) {
      throw new InvalidIncomingPaymentExpiryError(
        'expiresAt must be in the future'
      );
    }
    if (resolvedExpiresAt.getTime() > Date.now() + MAX_EXPIRY_MS) {
      throw new InvalidIncomingPaymentExpiryError(
        'expiresAt must be within 30 days'
      );
    }

    return new IncomingPaymentEntity(
      id,
      walletAddressId,
      wallet.assetCode,
      wallet.assetScale,
      resolvedExpiresAt,
      incomingAmount != null ? BigInt(incomingAmount) : null
    ).toObject();
  }
}
