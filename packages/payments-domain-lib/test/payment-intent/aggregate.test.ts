import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentIntentAggregate } from '../../src/payment-intent/aggregate';
import {
  PaymentIntentCreatedEvent,
  PaymentIntentCreateFailedEvent
} from '../../src/payment-intent/events';
import { CreatePaymentIntentCmd } from '../../src/commands';
import {
  MockPaymentIntentRepo,
  MockWalletAddressAdapter,
  MockRatesServiceAdapter
} from '../mocks';
import { QuoteCreateFailedEvent } from '../../src/payment-intent/events';
import { CreateQuoteCmd } from '../../src/commands';
import { QuoteCompletedEvent } from '../../src/payment-intent/events';
import { IPaymentIntent } from '../../src/payment-intent/interfaces';

function makeCreatePaymentIntentCmd(
  overrides: Partial<{
    id: string;
    receiverWalletAddressId: string;
    receiverWalletAddress: string;
    expiresAt: string;
    incomingAmount: number;
  }> = {}
): CreatePaymentIntentCmd {
  return new CreatePaymentIntentCmd(
    {
      id: overrides.id ?? crypto.randomUUID(),
      receiverWalletAddressId: overrides.receiverWalletAddressId ?? 'wallet-1',
      receiverWalletAddress:
        overrides.receiverWalletAddress ?? 'domain.com/alice',
      expiresAt: overrides.expiresAt,
      incomingAmount: overrides.incomingAmount
    },
    crypto.randomUUID()
  );
}

function makeCreateQuoteCmd(
  overrides: Partial<{
    id: string;
    paymentIntentId: string;
    senderWalletAddressId: string;
    senderWalletAddress: string;
    debitAmount: number;
    receiveAmount: number;
    incomingAmount: number;
  }> = {}
): CreateQuoteCmd {
  return new CreateQuoteCmd(
    {
      id: crypto.randomUUID(),
      paymentIntentId: crypto.randomUUID(),
      senderWalletAddressId: 'wallet-1',
      senderWalletAddress: 'domain.com/bob',
      debitAmount: 100,
      ...overrides
    },
    crypto.randomUUID()
  );
}

describe('PaymentIntentAggregate.handleBatch', () => {
  let repo: MockPaymentIntentRepo;
  let walletAddressAdapter: MockWalletAddressAdapter;
  let aggregate: PaymentIntentAggregate;

  beforeEach(() => {
    repo = new MockPaymentIntentRepo();
    walletAddressAdapter = new MockWalletAddressAdapter();
    walletAddressAdapter.addWalletAddress({
      id: 'wallet-1',
      isActive: true,
      assetCode: 'USD',
      assetScale: 2
    });
    aggregate = new PaymentIntentAggregate(
      repo,
      walletAddressAdapter,
      new MockRatesServiceAdapter()
    );
  });

  describe('handleBatch', async () => {
    describe('handleCreatePaymentIntentCommand', async () => {
      it('creates a payment intent', async () => {
        const cmd = makeCreatePaymentIntentCmd();
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentIntentCreatedEvent.name);
        assert.equal(
          (events[0] as PaymentIntentCreatedEvent).payload.id,
          cmd.payload.id
        );
      });

      it('fails if duplicate payment intent id', async () => {
        const id = crypto.randomUUID();
        const cmd1 = makeCreatePaymentIntentCmd({ id });
        const cmd2 = makeCreatePaymentIntentCmd({ id });
        const { events } = await aggregate.handleBatch([cmd1, cmd2]);

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, PaymentIntentCreatedEvent.name);
        assert.equal(events[1].msgName, PaymentIntentCreateFailedEvent.name);
        const payload = (events[1] as PaymentIntentCreateFailedEvent).payload;
        assert.equal(
          payload.errorName,
          'CannotCreateDuplicatePaymentIntentError'
        );
      });

      it('fails if when wallet address not found', async () => {
        const cmd = makeCreatePaymentIntentCmd({
          receiverWalletAddressId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
        const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'WalletAddressNotFoundError');
      });

      it('fails if when wallet address is inactive', async () => {
        walletAddressAdapter.addWalletAddress({
          id: 'inactive-wallet',
          isActive: false,
          assetCode: 'USD',
          assetScale: 2
        });
        const cmd = makeCreatePaymentIntentCmd({
          receiverWalletAddressId: 'inactive-wallet'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentIntentCreateFailedEvent.name);
        const payload = (events[0] as PaymentIntentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'WalletAddressInactiveError');
      });
    });

    describe('handleCreateQuoteCommand', () => {
      it('fails if quote when sender wallet address not found', async () => {
        const quoteCmd = makeCreateQuoteCmd({
          senderWalletAddressId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'WalletAddressNotFoundError');
        assert.match(payload.message, /Wallet address nonexistent not found/);
      });

      it('fails if quote when sender wallet address is inactive', async () => {
        walletAddressAdapter.addWalletAddress({
          id: 'inactive-sender',
          isActive: false,
          assetCode: 'USD',
          assetScale: 2
        });

        const quoteCmd = makeCreateQuoteCmd({
          senderWalletAddressId: 'inactive-sender'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'WalletAddressInactiveError');
      });

      it('fails if quote when payment intent not found', async () => {
        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails if quote when payment intent is in invalid state', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receiverWalletAddressId: crypto.randomUUID(),
          receiverWalletAddress: crypto.randomUUID(),
          state: 'COMPLETED',
          destination: 'LOCAL',
          assetCode: 'USD',
          assetScale: 0,
          expiresAt: new Date(),
          incomingAmount: null,
          receivedAmount: 0n,
          quotes: []
        };
        repo.storeMany([paymentIntent]);

        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntent.id
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentInvalidState');
        assert.match(payload.message, /COMPLETED/);
      });

      it('fails if payment intent is expired', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receiverWalletAddressId: 'wallet-1',
          receiverWalletAddress: 'domain.com/alice',
          state: 'CREATED',
          destination: 'LOCAL',
          assetCode: 'USD',
          assetScale: 2,
          expiresAt: new Date(Date.now() - 10000), // expired
          incomingAmount: null,
          receivedAmount: 0n,
          quotes: []
        };
        repo.storeMany([paymentIntent]);

        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntent.id
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentInvalidState');
        assert.match(payload.message, /expired/);
      });

      it('fails if invalid amount for quote', async () => {
        const paymentIntentId = crypto.randomUUID();
        const createPaymentIntentCmd = makeCreatePaymentIntentCmd({
          id: paymentIntentId
        });
        await aggregate.handleBatch([createPaymentIntentCmd]);

        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntentId,
          debitAmount: undefined,
          receiveAmount: undefined
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'InvalidQuoteAmountError');
      });

      it('successfully creates quote with debitAmount', async () => {
        const paymentIntentId = crypto.randomUUID();
        const createPaymentIntentCmd = makeCreatePaymentIntentCmd({
          id: paymentIntentId
        });
        await aggregate.handleBatch([createPaymentIntentCmd]);

        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntentId,
          debitAmount: 100
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCompletedEvent.name);
      });

      it('successfully creates quote with receiveAmount', async () => {
        const paymentIntentId = crypto.randomUUID();
        const createPaymentIntentCmd = makeCreatePaymentIntentCmd({
          id: paymentIntentId
        });
        await aggregate.handleBatch([createPaymentIntentCmd]);

        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntentId,
          debitAmount: undefined,
          receiveAmount: 200
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCompletedEvent.name);
      });

      it('successfully creates quote with incomingAmount from payment intent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const createPaymentIntentCmd = makeCreatePaymentIntentCmd({
          id: paymentIntentId,
          incomingAmount: 1000
        });
        await aggregate.handleBatch([createPaymentIntentCmd]);

        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntentId,
          debitAmount: undefined,
          receiveAmount: undefined
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCompletedEvent.name);
      });
    });
  });

  describe('flush', async () => {
    it('creates a payment intent', async () => {
      const paymentIntentId = crypto.randomUUID();
      const setupCmd = makeCreatePaymentIntentCmd({ id: paymentIntentId });
      await aggregate.handleBatch([setupCmd]);
      await aggregate.flush();

      const stored = repo.getAll();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, paymentIntentId);
    });

    it('stores quotes for a payment intent', async () => {
      const paymentIntentId = crypto.randomUUID();
      const setupCmd = makeCreatePaymentIntentCmd({ id: paymentIntentId });
      await aggregate.handleBatch([setupCmd]);
      await aggregate.flush();

      const quoteId = crypto.randomUUID();
      const quoteCmd = makeCreateQuoteCmd({ id: quoteId, paymentIntentId });

      const { events } = await aggregate.handleBatch([quoteCmd]);
      assert.equal(events.length, 1);
      assert.equal(events[0].msgName, QuoteCompletedEvent.name);

      await aggregate.flush();

      const stored = repo.getAll();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, paymentIntentId);
      assert.equal(stored[0].quotes.length, 1);
      assert.equal(stored[0].quotes[0].id, quoteId);
    });
  });
});
