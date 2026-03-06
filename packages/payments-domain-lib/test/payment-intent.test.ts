import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentsDomainService } from '../src/domain-service';
import { PaymentIntentAggregate } from '../src/payment-intent/aggregate';
import {
  PaymentIntentCreatedEvent,
  PaymentIntentCreateFailedEvent
} from '../src/payment-intent/events';
import { CreatePaymentIntentCmd } from '../src/commands';
import { MockPaymentIntentRepo } from './mocks/mock-payment-intent-repo';
import { MockWalletAddressAdapter } from './mocks/mock-wallet-address-port';

function makeCmd(
  overrides: Partial<{
    id: string;
    walletAddressId: string;
    walletAddress: string;
    expiresAt: string;
    incomingAmount: number;
  }> = {}
): CreatePaymentIntentCmd {
  return new CreatePaymentIntentCmd(
    {
      id: overrides.id ?? crypto.randomUUID(),
      walletAddressId: overrides.walletAddressId ?? 'wallet-1',
      walletAddress: overrides.walletAddress ?? 'domain.com/alice',
      expiresAt: overrides.expiresAt,
      incomingAmount: overrides.incomingAmount
    },
    crypto.randomUUID()
  );
}

describe('PaymentsDomainService.handleBatch', () => {
  let repo: MockPaymentIntentRepo;
  let walletAdapter: MockWalletAddressAdapter;
  let service: PaymentsDomainService;

  beforeEach(() => {
    repo = new MockPaymentIntentRepo();
    walletAdapter = new MockWalletAddressAdapter();
    walletAdapter.addWallet({
      id: 'wallet-1',
      isActive: true,
      assetCode: 'USD',
      assetScale: 2
    });
    const aggregate = new PaymentIntentAggregate();
    service = new PaymentsDomainService(repo, walletAdapter, aggregate);
  });

  it('creates a payment intent', async () => {
    const cmd = makeCmd();
    const events = await service.handleBatch([cmd]);

    assert.equal(events.length, 1);
    assert.equal(events[0].msgName, PaymentIntentCreatedEvent.name);
    assert.equal(
      (events[0] as PaymentIntentCreatedEvent).payload.id,
      cmd.payload.id
    );

    const stored = repo.getAll();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, cmd.payload.id);
    assert.equal(stored[0].walletAddressId, 'wallet-1');
    assert.equal(stored[0].walletAddress, 'domain.com/alice');
    assert.equal(stored[0].assetCode, 'USD');
    assert.equal(stored[0].assetScale, 2);
    assert.equal(stored[0].state, 'CREATED');
  });

  it('rejects duplicate payment intent id (across batches)', async () => {
    const id = crypto.randomUUID();
    const cmd1 = makeCmd({ id });
    await service.handleBatch([cmd1]);

    const cmd2 = makeCmd({ id });
    const events = await service.handleBatch([cmd2]);

    assert.equal(events.length, 1);
    assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
    const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
    assert.equal(payload.errorName, 'CannotCreateDuplicatePaymentIntentError');
  });

  it('rejects duplicate payment intent id (within same batch)', async () => {
    const id = crypto.randomUUID();
    const cmd1 = makeCmd({ id });
    const cmd2 = makeCmd({ id });
    const events = await service.handleBatch([cmd1, cmd2]);

    assert.equal(events.length, 2);
    assert.equal(events[0].msgName, PaymentIntentCreatedEvent.name);
    assert.equal(events[1].msgName, PaymentIntentCreateFailedEvent.name);
    const payload = (events[1] as PaymentIntentCreateFailedEvent).payload;
    assert.equal(payload.errorName, 'CannotCreateDuplicatePaymentIntentError');

    // Only one entity stored
    assert.equal(repo.getAll().length, 1);
  });

  it('rejects when wallet address not found', async () => {
    const cmd = makeCmd({ walletAddressId: 'nonexistent' });
    const events = await service.handleBatch([cmd]);

    assert.equal(events.length, 1);
    assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
    const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
    assert.equal(payload.errorName, 'WalletAddressNotFoundError');
  });

  it('rejects when wallet address is inactive', async () => {
    walletAdapter.addWallet({
      id: 'inactive-wallet',
      isActive: false,
      assetCode: 'USD',
      assetScale: 2
    });
    const cmd = makeCmd({ walletAddressId: 'inactive-wallet' });
    const events = await service.handleBatch([cmd]);

    assert.equal(events.length, 1);
    assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
    const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
    assert.equal(payload.errorName, 'WalletAddressInactiveError');
  });

  it('rejects expiry in the past', async () => {
    const pastDate = new Date(Date.now() - 60_000).toISOString();
    const cmd = makeCmd({ expiresAt: pastDate });
    const events = await service.handleBatch([cmd]);

    assert.equal(events.length, 1);
    assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
    const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
    assert.equal(payload.errorName, 'InvalidPaymentIntentExpiryError');
    assert.match(payload.message, /future/);
  });

  it('rejects expiry too far in the future', async () => {
    const farFuture = new Date(
      Date.now() + 1000 * 60 * 60 * 24 * 31
    ).toISOString(); // 31 days
    const cmd = makeCmd({ expiresAt: farFuture });
    const events = await service.handleBatch([cmd]);

    assert.equal(events.length, 1);
    assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
    const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
    assert.equal(payload.errorName, 'InvalidPaymentIntentExpiryError');
    assert.match(payload.message, /30 days/);
  });
});
