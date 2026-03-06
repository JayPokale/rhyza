import { Message } from 'common-types-lib';
import {
  IPaymentIntent,
  IPaymentIntentRepository,
  IWalletAddressService,
  WalletAddress
} from './payment-intent/interfaces';
import { PaymentIntentAggregate } from './payment-intent/aggregate';
import { PaymentIntentCreateFailedEvent } from './payment-intent/events';
import { CreatePaymentIntentCmd } from './commands';

export class PaymentsDomainService {
  private _repo: IPaymentIntentRepository;
  private _walletAddressService: IWalletAddressService;
  private _aggregate: PaymentIntentAggregate;

  constructor(
    repo: IPaymentIntentRepository,
    walletAddressService: IWalletAddressService,
    aggregate: PaymentIntentAggregate
  ) {
    this._repo = repo;
    this._walletAddressService = walletAddressService;
    this._aggregate = aggregate;
  }

  async handleBatch(cmds: Message[]): Promise<Message[]> {
    const outputEvents: Message[] = [];
    const newEntities: IPaymentIntent[] = [];

    // prefetch any external data needed to process the batch
    const walletIdSet = new Set<string>();
    const paymentIds: string[] = [];
    for (const cmd of cmds) {
      if (cmd.msgName === CreatePaymentIntentCmd.name) {
        const payload = (cmd as CreatePaymentIntentCmd).payload;
        walletIdSet.add(payload.walletAddressId);
        paymentIds.push(payload.id);
      }
    }

    const [walletsArr, existingPayments] = await Promise.all([
      this._walletAddressService.fetchByIds([...walletIdSet]),
      this._repo.fetchByIds(paymentIds)
    ]);

    const walletMap = new Map<string, WalletAddress>();
    for (const w of walletsArr) {
      walletMap.set(w.id, w);
    }

    // seed seenIds with existing DB entities — add newly processed ones as we go
    const seenIds = new Set<string>(existingPayments.map((p) => p.id));

    // process each command
    for (const cmd of cmds) {
      if (cmd.msgName === CreatePaymentIntentCmd.name) {
        const command = cmd as CreatePaymentIntentCmd;
        try {
          const { entity, event } = this._aggregate.create(
            command.payload,
            walletMap,
            seenIds,
            command.requestId
          );

          newEntities.push(entity);
          seenIds.add(command.payload.id);
          outputEvents.push(event);
        } catch (e) {
          outputEvents.push(
            new PaymentIntentCreateFailedEvent(
              {
                errorName: (e as Error).constructor.name,
                message: (e as Error).message
              },
              command.requestId
            )
          );
        }
      }
    }

    // flush
    if (newEntities.length > 0) {
      await this._repo.storeMany(newEntities);
    }

    return outputEvents;
  }
}
