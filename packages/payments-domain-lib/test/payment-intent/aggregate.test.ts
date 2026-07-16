import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ConsoleLogger } from 'common-types-lib';

import { PaymentIntentAggregate } from '../../src/payment-intent/aggregate';
import {
  PaymentCompletedEvent,
  PaymentCompleteFailedEvent,
  PaymentCreatedEvent,
  PaymentCreateFailedEvent,
  PaymentIntentCreatedEvent,
  PaymentIntentCreateFailedEvent,
  PaymentIntentCompletedEvent
} from 'payments-public-types-lib';
import {
  CompleteRemoteQuoteCmd,
  CreatePaymentCmd,
  CreatePaymentIntentCmd,
  FailRemoteQuoteCmd,
  CalculateRemoteQuoteCmd,
  CancelPaymentCmd,
  PrepareRemotePaymentCmd,
  FailRemotePaymentCmd,
  ConfirmRemotePaymentCmd,
  RejectRemotePaymentCmd,
  CompleteRemotePaymentCmd,
  ValidateReceivedPaymentCmd,
  AcceptReceivedPaymentCmd,
  FailReceivedPaymentCmd,
  MarkReceivedPaymentFulfillableCmd,
  FinalizeReceivedPaymentCmd
} from '../../src/commands';
import {
  MockPaymentIntentRepo,
  MockRemotePaymentIntentService,
  MockPalService
} from '../mocks';
import {
  QuoteCreateFailedEvent,
  QuoteCompletedEvent
} from 'payments-public-types-lib';
import { CreateQuoteCmd } from '../../src/commands';
import {
  IPaymentIntent,
  SentPaymentState
} from '../../src/payment-intent/interfaces';
import { ApprovePaymentCmd } from '../../src/commands';
import {
  RemoteQuoteRequestedEvent,
  RemoteQuoteCalculatedEvent,
  RemoteQuoteCalculationFailedEvent,
  PaymentCancelledEvent,
  PaymentCancelFailedEvent,
  RemotePaymentSendApprovedEvent,
  RemotePaymentPreparedEvent,
  PaymentFailedEvent,
  RemotePaymentSendConfirmedEvent,
  RemotePaymentSendRejectedEvent,
  ReceivedPaymentValidatedEvent,
  ReceivedPaymentValidationFailedEvent,
  ReceivedPaymentAcceptedEvent,
  ReceivedPaymentFailedEvent,
  ReceivedPaymentFulfillableEvent,
  ReceivedPaymentFinalizedEvent
} from 'payments-public-types-lib';

function makeApprovePaymentCmd(
  overrides: Partial<{
    id: string;
    paymentIntentId: string;
  }> = {}
): ApprovePaymentCmd {
  return new ApprovePaymentCmd(
    {
      id: overrides.id ?? crypto.randomUUID(),
      paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
      ...overrides
    },
    crypto.randomUUID()
  );
}

function makeCancelPaymentCmd(
  overrides: Partial<{
    id: string;
    paymentIntentId: string;
    reason: string;
  }> = {}
): CancelPaymentCmd {
  return new CancelPaymentCmd(
    {
      id: overrides.id ?? crypto.randomUUID(),
      paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
      reason: overrides.reason ?? 'cancelled by user',
      ...overrides
    },
    crypto.randomUUID()
  );
}

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
    remoteUrl: string;
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

function makeCreatePaymentCmd(
  overrides: Partial<{
    id: string;
    paymentIntentId: string;
    senderWalletAddressId: string;
    senderWalletAddress: string;
    debitAmount: number;
    quoteId: string;
  }> = {}
): CreatePaymentCmd {
  return new CreatePaymentCmd(
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
  let mockRemotePaymentIntentService: MockRemotePaymentIntentService;
  let mockPalService: MockPalService;
  let aggregate: PaymentIntentAggregate;

  beforeEach(() => {
    repo = new MockPaymentIntentRepo();
    mockPalService = new MockPalService();
    mockPalService.addWalletAddress({
      id: 'wallet-1',
      isActive: true,
      assetCode: 'USD',
      assetScale: 2
    });
    mockRemotePaymentIntentService = new MockRemotePaymentIntentService();
    aggregate = new PaymentIntentAggregate(
      repo,
      mockPalService,
      mockRemotePaymentIntentService,
      new ConsoleLogger()
    );
  });

  function makeRemotePaymentIntentWithPendingQuote(
    quoteId: string
  ): IPaymentIntent {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date(),
      receivedAmount: 0n,
      receiverWalletAddress: 'remote.domain.com/alice',
      assetCode: 'USD',
      assetScale: 2,
      state: 'CREATED',
      destination: 'REMOTE',
      expiresAt: new Date(Date.now() + 60_000),
      incomingAmount: null,
      quotes: [
        {
          id: quoteId,
          state: 'PENDING',
          senderWalletAddress: 'domain.com/bob',
          senderWalletAddressId: 'wallet-1',
          peerId: 'peer-1',
          peerAssetCode: 'USD',
          peerAssetScale: 2,
          sourceAmount: 100n,
          senderAssetCode: 'USD',
          debitAmount: 500n
        }
      ],
      sentPayments: [],
      receivedPayments: [],
      destinationIlpAddress: 'g.peer.123'
    };
  }

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
        mockPalService.addWalletAddress({
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
      it('fails when sender wallet address not found', async () => {
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

      it('fails when sender wallet address is inactive', async () => {
        mockPalService.addWalletAddress({
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

      it('fails when payment intent not found', async () => {
        const quoteCmd = makeCreateQuoteCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails if rates could not be fetched', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'receiver',
          receiverWalletAddressId: crypto.randomUUID(),
          assetCode: 'EUR',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        mockPalService.getRates = async () => null;

        const cmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'RatesError');
      });

      it('creates local quote', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'receiver',
          receiverWalletAddressId: crypto.randomUUID(),
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCompletedEvent.name);
        const completedPayload = (events[0] as QuoteCompletedEvent).payload;
        assert.equal(completedPayload.id, cmd.payload.id);
        assert.equal(completedPayload.paymentIntentId, paymentIntent.id);
      });

      it('emits RemoteQuoteRequestedEvent for remote payment intent', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: [],
          destinationIlpAddress: 'g.peer.123'
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeCreateQuoteCmd({
          paymentIntentId: paymentIntent.id,
          debitAmount: 500
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteRequestedEvent.name);
        const payload = (events[0] as RemoteQuoteRequestedEvent).payload;
        assert.equal(payload.paymentIntentId, paymentIntent.id);
        assert.equal(payload.quoteId, cmd.payload.id);
        assert.equal(payload.peerId, 'peer-1');
        assert.equal(
          payload.receiverWalletAddress,
          paymentIntent.receiverWalletAddress
        );
        assert.equal(
          payload.senderWalletAddress,
          cmd.payload.senderWalletAddress
        );
        assert.equal(payload.senderAssetCode, 'USD');
        assert.equal(payload.senderAssetScale, 2);
      });

      it('fails with MissingDestinationIlpAddressError for remote intent without ilp address', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeCreateQuoteCmd({ paymentIntentId: paymentIntent.id });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'MissingDestinationIlpAddressError');
      });
    });

    describe('handleCompleteRemoteQuoteCommand', () => {
      function makeCompleteRemoteQuoteCmd(
        overrides: Partial<{
          paymentIntentId: string;
          quoteId: string;
          receiveAmountValue: string;
        }> = {}
      ): CompleteRemoteQuoteCmd {
        return new CompleteRemoteQuoteCmd(
          {
            paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
            quoteId: overrides.quoteId ?? crypto.randomUUID(),
            receiveAmountValue: overrides.receiveAmountValue ?? '10000'
          },
          crypto.randomUUID()
        );
      }

      it('emits QuoteCompletedEvent on success', async () => {
        const quoteId = crypto.randomUUID();
        const paymentIntent = makeRemotePaymentIntentWithPendingQuote(quoteId);
        await repo.storeMany([paymentIntent]);

        const cmd = makeCompleteRemoteQuoteCmd({
          paymentIntentId: paymentIntent.id,
          quoteId
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCompletedEvent.name);
        const payload = (events[0] as QuoteCompletedEvent).payload;
        assert.equal(payload.id, quoteId);
        assert.equal(payload.paymentIntentId, paymentIntent.id);
      });

      it('fails when payment intent not found', async () => {
        const cmd = makeCompleteRemoteQuoteCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails when quote not found', async () => {
        const paymentIntent = makeRemotePaymentIntentWithPendingQuote(
          crypto.randomUUID()
        );
        await repo.storeMany([paymentIntent]);

        const cmd = makeCompleteRemoteQuoteCmd({
          paymentIntentId: paymentIntent.id,
          quoteId: 'nonexistent-quote'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'InvalidQuoteIdError');
      });

      describe('FX calculation', () => {
        function makeCrossAssetPendingQuoteIntent(
          quoteId: string,
          amountOverride: { debitAmount: bigint } | { receiveAmount: bigint }
        ): IPaymentIntent {
          return {
            id: crypto.randomUUID(),
            receivedAmount: 0n,
            receiverWalletAddress: 'remote.domain.com/alice',
            assetCode: 'XRP',
            assetScale: 6,
            state: 'CREATED',
            destination: 'REMOTE',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60_000),
            incomingAmount: null,
            quotes: [
              {
                id: quoteId,
                state: 'PENDING',
                senderWalletAddress: 'domain.com/bob',
                senderWalletAddressId: 'wallet-1',
                peerId: 'peer-1',
                peerAssetCode: 'EUR',
                peerAssetScale: 2,
                sourceAmount: 100n,
                senderAssetCode: 'USD',
                ...amountOverride
              }
            ],
            sentPayments: [],
            receivedPayments: [],
            destinationIlpAddress: 'g.peer.123'
          };
        }

        it('cross-asset success: prefetched FX rate is passed to entity and applied', async () => {
          const quoteId = crypto.randomUUID();
          const paymentIntent = makeCrossAssetPendingQuoteIntent(quoteId, {
            debitAmount: 1000n
          });
          mockPalService.getRates = async () => 0.9;
          await repo.storeMany([paymentIntent]);

          const cmd = makeCompleteRemoteQuoteCmd({
            paymentIntentId: paymentIntent.id,
            quoteId,
            receiveAmountValue: '10000'
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events[0].msgName, QuoteCompletedEvent.name);
          const payload = (events[0] as QuoteCompletedEvent).payload;
          // debitAmount = 1000 USD
          // receiveAmount = USD amount * (USD->EUR rate) * (EUR->receiver rate)
          //              = 1000 * (0.9) * (10000 / 100)
          //              = 90000 XRP
          assert.equal(payload.debitAmount, '1000');
          assert.equal(payload.receiveAmount, '90000');
          assert.equal(payload.exchangeRate, 90);
        });

        it('fails with RatesError when FX rate is unavailable', async () => {
          const quoteId = crypto.randomUUID();
          const paymentIntent = makeCrossAssetPendingQuoteIntent(quoteId, {
            debitAmount: 1000n
          });
          mockPalService.getRates = async () => null;
          await repo.storeMany([paymentIntent]);

          const cmd = makeCompleteRemoteQuoteCmd({
            paymentIntentId: paymentIntent.id,
            quoteId,
            receiveAmountValue: '10000'
          });
          const { events } = await aggregate.handleBatch([cmd]);

          assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
          const payload = (events[0] as QuoteCreateFailedEvent).payload;
          assert.equal(payload.errorName, 'RatesError');
        });
      });
    });

    describe('handleFailRemoteQuoteCommand', () => {
      function makeFailRemoteQuoteCmd(
        overrides: Partial<{
          paymentIntentId: string;
          quoteId: string;
          errorName: string;
          message: string;
        }> = {}
      ): FailRemoteQuoteCmd {
        return new FailRemoteQuoteCmd(
          {
            paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
            quoteId: overrides.quoteId ?? crypto.randomUUID(),
            errorName: overrides.errorName ?? 'IlpQuoteError',
            message: overrides.message ?? 'Quote could not be determined'
          },
          crypto.randomUUID()
        );
      }

      it('emits QuoteCreateFailedEvent with ILP error details', async () => {
        const quoteId = crypto.randomUUID();
        const paymentIntent = makeRemotePaymentIntentWithPendingQuote(quoteId);
        await repo.storeMany([paymentIntent]);

        const cmd = makeFailRemoteQuoteCmd({
          paymentIntentId: paymentIntent.id,
          quoteId,
          errorName: 'IlpQuoteError',
          message: 'No route to destination'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.paymentIntentId, paymentIntent.id);
        assert.equal(payload.errorName, 'IlpQuoteError');
        assert.equal(payload.message, 'No route to destination');
      });

      it('fails when payment intent not found', async () => {
        const cmd = makeFailRemoteQuoteCmd({ paymentIntentId: 'nonexistent' });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails when quote not found', async () => {
        const paymentIntent = makeRemotePaymentIntentWithPendingQuote(
          crypto.randomUUID()
        );
        await repo.storeMany([paymentIntent]);

        const cmd = makeFailRemoteQuoteCmd({
          paymentIntentId: paymentIntent.id,
          quoteId: 'nonexistent-quote'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'InvalidQuoteIdError');
      });
    });

    describe('handleCalculateRemoteQuoteCommand', () => {
      function makeLocalIntent(
        overrides: Partial<{
          assetCode: string;
          assetScale: number;
        }> = {}
      ): IPaymentIntent {
        return {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'domain.com/alice',
          receiverWalletAddressId: 'wallet-1',
          assetCode: overrides.assetCode ?? 'USD',
          assetScale: overrides.assetScale ?? 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
      }

      function makeCalculateRemoteQuoteCmd(
        overrides: Partial<{
          packetId: string;
          peerId: string;
          paymentIntentId: string;
          sourceAmount: string;
          peerAssetCode: string;
          peerAssetScale: number;
        }> = {}
      ): CalculateRemoteQuoteCmd {
        const peerId = overrides.peerId ?? 'peer-1';
        // Peer asset is resolved from PAL (getPeerById), not carried on the
        // command — route the override to the mock PAL service.
        mockPalService.setPeerById({
          peerId,
          assetCode: overrides.peerAssetCode ?? 'USD',
          assetScale: overrides.peerAssetScale ?? 2
        });
        return new CalculateRemoteQuoteCmd(
          {
            packetId: overrides.packetId ?? crypto.randomUUID(),
            peerId,
            paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
            sourceAmount: overrides.sourceAmount ?? '100'
          },
          crypto.randomUUID()
        );
      }

      it('same-asset: emits RemoteQuoteCalculatedEvent with receiveAmount = sourceAmount', async () => {
        const intent = makeLocalIntent({ assetCode: 'USD', assetScale: 2 });
        await repo.storeMany([intent]);

        const cmd = makeCalculateRemoteQuoteCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'USD',
          peerAssetScale: 2,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteCalculatedEvent.name);
        const payload = (events[0] as RemoteQuoteCalculatedEvent).payload;
        assert.equal(payload.paymentIntentId, intent.id);
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.receiveAssetCode, 'USD');
        assert.equal(payload.receiveAssetScale, 2);
        assert.equal(payload.packetId, cmd.payload.packetId);
        assert.equal(payload.peerId, cmd.payload.peerId);
      });

      it('cross-asset same scale: floors receiveAmount = sourceAmount * fxRate', async () => {
        const intent = makeLocalIntent({ assetCode: 'XRP', assetScale: 2 });
        await repo.storeMany([intent]);
        mockPalService.getRates = async () => 100.5;

        const cmd = makeCalculateRemoteQuoteCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'USD',
          peerAssetScale: 2,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteCalculatedEvent.name);
        const payload = (events[0] as RemoteQuoteCalculatedEvent).payload;
        // scaleDiff = 0, floor(100 * 100.5) = 10050
        assert.equal(payload.receiveAmount, '10050');
        assert.equal(payload.receiveAssetCode, 'XRP');
        assert.equal(payload.receiveAssetScale, 2);
      });

      it('cross-asset receiver scale > peer scale: emits in receiver scale', async () => {
        // peer EUR/2, receiver XRP/4, 1 EUR = 2 XRP
        // sourceAmount = 100 (1.00 EUR) -> 2.00 XRP = 20000 units
        const intent = makeLocalIntent({ assetCode: 'XRP', assetScale: 4 });
        await repo.storeMany([intent]);
        mockPalService.getRates = async () => 2;

        const cmd = makeCalculateRemoteQuoteCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'EUR',
          peerAssetScale: 2,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteCalculatedEvent.name);
        const payload = (events[0] as RemoteQuoteCalculatedEvent).payload;
        // scaleDiff = 4 - 2 = 2, floor(100 * 2 * 100) = 20000
        assert.equal(payload.receiveAmount, '20000');
        assert.equal(payload.receiveAssetCode, 'XRP');
        assert.equal(payload.receiveAssetScale, 4);
      });

      it('fails with PaymentIntentNotFoundError when intent missing', async () => {
        const cmd = makeCalculateRemoteQuoteCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteCalculationFailedEvent.name);
        const payload = (events[0] as RemoteQuoteCalculationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
        assert.equal(payload.paymentIntentId, 'nonexistent');
        assert.equal(payload.packetId, cmd.payload.packetId);
        assert.equal(payload.peerId, cmd.payload.peerId);
      });

      it('fails with RatesError when cross-asset and FX rate unavailable', async () => {
        const intent = makeLocalIntent({ assetCode: 'XRP', assetScale: 6 });
        await repo.storeMany([intent]);
        mockPalService.getRates = async () => null;

        const cmd = makeCalculateRemoteQuoteCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'USD',
          peerAssetScale: 2,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteCalculationFailedEvent.name);
        const payload = (events[0] as RemoteQuoteCalculationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'RatesError');
      });

      it('fails with original error when FX fetch throws', async () => {
        const intent = makeLocalIntent({ assetCode: 'XRP', assetScale: 6 });
        await repo.storeMany([intent]);
        mockPalService.getRates = async () => {
          throw new Error('PAL exploded');
        };

        const cmd = makeCalculateRemoteQuoteCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'USD',
          peerAssetScale: 2,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteCalculationFailedEvent.name);
        const payload = (events[0] as RemoteQuoteCalculationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'Error');
        assert.equal(payload.message, 'PAL exploded');
      });
    });

    describe('handleValidateReceivedPaymentCommand', () => {
      function makeLocalIntent(
        overrides: Partial<{
          assetCode: string;
          assetScale: number;
          state: IPaymentIntent['state'];
          destination: IPaymentIntent['destination'];
          expiresAt: Date;
        }> = {}
      ): IPaymentIntent {
        return {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'domain.com/alice',
          receiverWalletAddressId: 'wallet-1',
          assetCode: overrides.assetCode ?? 'USD',
          assetScale: overrides.assetScale ?? 2,
          state: overrides.state ?? 'CREATED',
          destination: overrides.destination ?? 'LOCAL',
          createdAt: new Date(),
          expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
      }

      function makeValidateReceivedPaymentCmd(
        overrides: Partial<{
          id: string;
          paymentIntentId: string;
          packetId: string;
          peerId: string;
          sourceAmount: string;
          peerAssetCode: string;
          peerAssetScale: number;
        }> = {}
      ): ValidateReceivedPaymentCmd {
        return new ValidateReceivedPaymentCmd(
          {
            id: overrides.id ?? crypto.randomUUID(),
            paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
            packetId: overrides.packetId ?? crypto.randomUUID(),
            peerId: overrides.peerId ?? 'peer-1',
            sourceAmount: overrides.sourceAmount ?? '100',
            peerAssetCode: overrides.peerAssetCode ?? 'USD',
            peerAssetScale: overrides.peerAssetScale ?? 2
          },
          crypto.randomUUID()
        );
      }

      it('same-asset: emits ReceivedPaymentValidatedEvent with receiveAmount = sourceAmount', async () => {
        const intent = makeLocalIntent({ assetCode: 'USD', assetScale: 2 });
        await repo.storeMany([intent]);

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, ReceivedPaymentValidatedEvent.name);
        const payload = (events[0] as ReceivedPaymentValidatedEvent).payload;
        assert.equal(payload.paymentIntentId, intent.id);
        assert.equal(payload.receivedPaymentId, cmd.payload.id);
        assert.equal(payload.packetId, cmd.payload.packetId);
        assert.equal(payload.peerId, cmd.payload.peerId);
        assert.equal(payload.sourceAmount, '100');
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.receiveAssetCode, 'USD');
        assert.equal(payload.receiveAssetScale, 2);
        assert.equal(payload.receiverWalletAddressId, 'wallet-1');
        assert.equal(payload.state, 'VALIDATED');
      });

      it('cross-asset: converts sourceAmount using FX rate and scale diff', async () => {
        // peer EUR/2, receiver XRP/4, 1 EUR = 2 XRP
        const intent = makeLocalIntent({ assetCode: 'XRP', assetScale: 4 });
        await repo.storeMany([intent]);
        mockPalService.getRates = async () => 2;

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'EUR',
          peerAssetScale: 2,
          sourceAmount: '100'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, ReceivedPaymentValidatedEvent.name);
        const payload = (events[0] as ReceivedPaymentValidatedEvent).payload;
        // scaleDiff = 2, floor(100 * 2 * 100) = 20000
        assert.equal(payload.receiveAmount, '20000');
        assert.equal(payload.receiveAssetCode, 'XRP');
        assert.equal(payload.receiveAssetScale, 4);
      });

      it('persists the received payment after flush', async () => {
        const intent = makeLocalIntent();
        await repo.storeMany([intent]);

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id,
          sourceAmount: '250'
        });
        await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        const stored = repo.getAll().find((p) => p.id === intent.id);
        assert(stored);
        assert.equal(stored.receivedPayments.length, 1);
        const receivedPayment = stored.receivedPayments[0];
        assert.equal(receivedPayment.id, cmd.payload.id);
        assert.equal(receivedPayment.state, 'VALIDATED');
        assert.equal(receivedPayment.paymentIntentId, intent.id);
        assert.equal(receivedPayment.packetId, cmd.payload.packetId);
        assert.equal(receivedPayment.peerId, cmd.payload.peerId);
        assert.equal(receivedPayment.sourceAmount, 250n);
        assert.equal(receivedPayment.receiveAmount, 250n);
      });

      it('fails with PaymentIntentNotFoundError when intent missing', async () => {
        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(
          events[0].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[0] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
        assert.equal(payload.paymentIntentId, 'nonexistent');
        assert.equal(payload.receivedPaymentId, cmd.payload.id);
        assert.equal(payload.packetId, cmd.payload.packetId);
        assert.equal(payload.peerId, cmd.payload.peerId);
      });

      it('fails with PaymentIntentInvalidState when intent destination is REMOTE', async () => {
        const intent = makeLocalIntent({ destination: 'REMOTE' });
        await repo.storeMany([intent]);

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(
          events[0].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[0] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'PaymentIntentInvalidState');
      });

      it('fails with PaymentIntentInvalidState when intent is COMPLETED', async () => {
        const intent = makeLocalIntent({ state: 'COMPLETED' });
        await repo.storeMany([intent]);

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(
          events[0].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[0] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'PaymentIntentInvalidState');
      });

      it('fails with PaymentIntentExpired when intent is expired', async () => {
        const intent = makeLocalIntent({
          expiresAt: new Date(Date.now() - 1000)
        });
        await repo.storeMany([intent]);

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(
          events[0].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[0] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'PaymentIntentExpired');
      });

      it('fails with InvalidPaymentAmountError when sourceAmount is not positive', async () => {
        const intent = makeLocalIntent();
        await repo.storeMany([intent]);

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id,
          sourceAmount: '0'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(
          events[0].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[0] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'InvalidPaymentAmountError');
      });

      it('fails with InvalidPaymentIdError on duplicate received payment id', async () => {
        const intent = makeLocalIntent();
        await repo.storeMany([intent]);

        const receivedPaymentId = crypto.randomUUID();
        const cmd1 = makeValidateReceivedPaymentCmd({
          id: receivedPaymentId,
          paymentIntentId: intent.id
        });
        const cmd2 = makeValidateReceivedPaymentCmd({
          id: receivedPaymentId,
          paymentIntentId: intent.id
        });
        const { events } = await aggregate.handleBatch([cmd1, cmd2]);

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, ReceivedPaymentValidatedEvent.name);
        assert.equal(
          events[1].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[1] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'InvalidPaymentIdError');
      });

      it('fails with RatesError when cross-asset and FX rate unavailable', async () => {
        const intent = makeLocalIntent({ assetCode: 'XRP', assetScale: 6 });
        await repo.storeMany([intent]);
        mockPalService.getRates = async () => null;

        const cmd = makeValidateReceivedPaymentCmd({
          paymentIntentId: intent.id,
          peerAssetCode: 'USD',
          peerAssetScale: 2
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(
          events[0].msgName,
          ReceivedPaymentValidationFailedEvent.name
        );
        const payload = (events[0] as ReceivedPaymentValidationFailedEvent)
          .payload;
        assert.equal(payload.errorName, 'RatesError');
      });
    });

    describe('handleAcceptReceivedPaymentCommand / handleFailReceivedPaymentCommand', () => {
      function makeIntentWithReceivedPayment(
        receivedPaymentState: IPaymentIntent['receivedPayments'][number]['state'] = 'VALIDATED'
      ): { intent: IPaymentIntent; receivedPaymentId: string } {
        const intentId = crypto.randomUUID();
        const receivedPaymentId = crypto.randomUUID();
        const intent: IPaymentIntent = {
          id: intentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'domain.com/alice',
          receiverWalletAddressId: 'wallet-1',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: [
            {
              id: receivedPaymentId,
              state: receivedPaymentState,
              paymentIntentId: intentId,
              packetId: 'packet-1',
              peerId: 'peer-1',
              peerAssetCode: 'USD',
              peerAssetScale: 2,
              sourceAmount: 100n,
              receiveAmount: 100n,
              createdAt: new Date()
            }
          ]
        };
        return { intent, receivedPaymentId };
      }

      it('accepts a VALIDATED received payment and emits ReceivedPaymentAcceptedEvent', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const cmd = new AcceptReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            ledgerTransferId: 'transfer-1'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, ReceivedPaymentAcceptedEvent.name);
        const payload = (events[0] as ReceivedPaymentAcceptedEvent).payload;
        assert.equal(payload.paymentIntentId, intent.id);
        assert.equal(payload.receivedPaymentId, receivedPaymentId);
        assert.equal(payload.packetId, 'packet-1');
        assert.equal(payload.peerId, 'peer-1');
        assert.equal(payload.ledgerTransferId, 'transfer-1');
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.receiveAssetCode, 'USD');
        assert.equal(payload.receiveAssetScale, 2);
        assert.equal(payload.state, 'ACCEPTED');
      });

      it('persists the accepted state and ledgerTransferId after flush', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const cmd = new AcceptReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            ledgerTransferId: 'transfer-1'
          },
          crypto.randomUUID()
        );
        await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        const stored = repo
          .getAll()
          .flatMap((p) => p.receivedPayments)
          .find((rp) => rp.id === receivedPaymentId);
        assert(stored);
        assert.equal(stored.state, 'ACCEPTED');
        assert.equal(stored.ledgerTransferId, 'transfer-1');
      });

      it('fails to accept from a non-VALIDATED state', async () => {
        const { intent, receivedPaymentId } =
          makeIntentWithReceivedPayment('ACCEPTED');
        await repo.storeMany([intent]);

        const cmd = new AcceptReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            ledgerTransferId: 'transfer-1'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });

      it('fails to accept when the payment intent is missing', async () => {
        const cmd = new AcceptReceivedPaymentCmd(
          {
            receivedPaymentId: crypto.randomUUID(),
            paymentIntentId: 'nonexistent',
            ledgerTransferId: 'transfer-1'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails to accept when the received payment is missing', async () => {
        const { intent } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const cmd = new AcceptReceivedPaymentCmd(
          {
            receivedPaymentId: 'nonexistent',
            paymentIntentId: intent.id,
            ledgerTransferId: 'transfer-1'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentNotFoundError');
      });

      it('fails a VALIDATED received payment and persists failReason', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const cmd = new FailReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            reason: 'Insufficient funds'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.receivedPaymentId, receivedPaymentId);
        assert.equal(payload.packetId, 'packet-1');
        assert.equal(payload.message, 'Insufficient funds');

        const stored = repo
          .getAll()
          .flatMap((p) => p.receivedPayments)
          .find((rp) => rp.id === receivedPaymentId);
        assert(stored);
        assert.equal(stored.state, 'FAILED');
        assert.equal(stored.failReason, 'Insufficient funds');
      });

      it('fails an ACCEPTED received payment', async () => {
        const { intent, receivedPaymentId } =
          makeIntentWithReceivedPayment('ACCEPTED');
        await repo.storeMany([intent]);

        const cmd = new FailReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            reason: 'Ledger transfer rejected'
          },
          crypto.randomUUID()
        );
        await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        const stored = repo
          .getAll()
          .flatMap((p) => p.receivedPayments)
          .find((rp) => rp.id === receivedPaymentId);
        assert(stored);
        assert.equal(stored.state, 'FAILED');
      });

      it('fails a FULFILLABLE received payment', async () => {
        const { intent, receivedPaymentId } =
          makeIntentWithReceivedPayment('FULFILLABLE');
        await repo.storeMany([intent]);

        const cmd = new FailReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            reason: 'ILP fulfillment failed'
          },
          crypto.randomUUID()
        );
        await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        const stored = repo
          .getAll()
          .flatMap((p) => p.receivedPayments)
          .find((rp) => rp.id === receivedPaymentId);
        assert(stored);
        assert.equal(stored.state, 'FAILED');
      });

      it('cannot fail a FINALIZED received payment', async () => {
        const { intent, receivedPaymentId } =
          makeIntentWithReceivedPayment('FINALIZED');
        await repo.storeMany([intent]);

        const cmd = new FailReceivedPaymentCmd(
          {
            receivedPaymentId,
            paymentIntentId: intent.id,
            reason: 'too late'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handleMarkReceivedPaymentFulfillableCommand', () => {
      function makeIntentWithReceivedPayment(
        state: IPaymentIntent['receivedPayments'][number]['state'] = 'ACCEPTED'
      ): { intent: IPaymentIntent; receivedPaymentId: string } {
        const intentId = crypto.randomUUID();
        const receivedPaymentId = crypto.randomUUID();
        const intent: IPaymentIntent = {
          id: intentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'domain.com/alice',
          receiverWalletAddressId: 'wallet-1',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: [
            {
              id: receivedPaymentId,
              state,
              paymentIntentId: intentId,
              packetId: 'packet-1',
              peerId: 'peer-1',
              peerAssetCode: 'USD',
              peerAssetScale: 2,
              sourceAmount: 100n,
              receiveAmount: 100n,
              createdAt: new Date(),
              ledgerTransferId: 'transfer-1'
            }
          ]
        };
        return { intent, receivedPaymentId };
      }

      it('marks an ACCEPTED received payment FULFILLABLE and emits ReceivedPaymentFulfillableEvent', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          new MarkReceivedPaymentFulfillableCmd(
            { receivedPaymentId, paymentIntentId: intent.id },
            crypto.randomUUID()
          )
        ]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, ReceivedPaymentFulfillableEvent.name);
        const payload = (events[0] as ReceivedPaymentFulfillableEvent).payload;
        assert.equal(payload.paymentIntentId, intent.id);
        assert.equal(payload.receivedPaymentId, receivedPaymentId);
        assert.equal(payload.packetId, 'packet-1');
        assert.equal(payload.peerId, 'peer-1');
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.receiveAssetCode, 'USD');
        assert.equal(payload.receiveAssetScale, 2);
        assert.equal(payload.state, 'FULFILLABLE');

        const stored = repo.getAll().find((p) => p.id === intent.id);
        assert(stored);
        assert.equal(stored.receivedPayments[0].state, 'FULFILLABLE');
        // receivedAmount is only credited at finalize, not here
        assert.equal(stored.receivedAmount, 0n);
      });

      it('cannot mark a VALIDATED received payment fulfillable', async () => {
        const { intent, receivedPaymentId } =
          makeIntentWithReceivedPayment('VALIDATED');
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          new MarkReceivedPaymentFulfillableCmd(
            { receivedPaymentId, paymentIntentId: intent.id },
            crypto.randomUUID()
          )
        ]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handleFinalizeReceivedPaymentCommand', () => {
      function makeIntentWithReceivedPayment(overrides?: {
        receivedPaymentState?: IPaymentIntent['receivedPayments'][number]['state'];
        incomingAmount?: bigint | null;
        receiveAmount?: bigint;
      }): { intent: IPaymentIntent; receivedPaymentId: string } {
        const intentId = crypto.randomUUID();
        const receivedPaymentId = crypto.randomUUID();
        const intent: IPaymentIntent = {
          id: intentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'domain.com/alice',
          receiverWalletAddressId: 'wallet-1',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: overrides?.incomingAmount ?? null,
          quotes: [],
          sentPayments: [],
          receivedPayments: [
            {
              id: receivedPaymentId,
              state: overrides?.receivedPaymentState ?? 'FULFILLABLE',
              paymentIntentId: intentId,
              packetId: 'packet-1',
              peerId: 'peer-1',
              peerAssetCode: 'USD',
              peerAssetScale: 2,
              sourceAmount: 100n,
              receiveAmount: overrides?.receiveAmount ?? 100n,
              createdAt: new Date(),
              ledgerTransferId: 'transfer-1'
            }
          ]
        };
        return { intent, receivedPaymentId };
      }

      function makeFinalizeCmd(
        receivedPaymentId: string,
        paymentIntentId: string
      ): FinalizeReceivedPaymentCmd {
        return new FinalizeReceivedPaymentCmd(
          { receivedPaymentId, paymentIntentId },
          crypto.randomUUID()
        );
      }

      it('finalizes an ACCEPTED received payment and accumulates receivedAmount', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          makeFinalizeCmd(receivedPaymentId, intent.id)
        ]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, ReceivedPaymentFinalizedEvent.name);
        const payload = (events[0] as ReceivedPaymentFinalizedEvent).payload;
        assert.equal(payload.paymentIntentId, intent.id);
        assert.equal(payload.receivedPaymentId, receivedPaymentId);
        assert.equal(payload.packetId, 'packet-1');
        assert.equal(payload.peerId, 'peer-1');
        assert.equal(payload.sourceAmount, '100');
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.receiveAssetCode, 'USD');
        assert.equal(payload.receiveAssetScale, 2);
        assert.equal(payload.state, 'FINALIZED');

        const stored = repo.getAll().find((p) => p.id === intent.id);
        assert(stored);
        assert.equal(stored.receivedAmount, 100n);
        assert.equal(stored.state, 'CREATED'); // no incomingAmount -> not completed
        assert.equal(stored.receivedPayments[0].state, 'FINALIZED');
      });

      it('completes the intent and emits PaymentIntentCompletedEvent when incomingAmount is met', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment({
          incomingAmount: 100n
        });
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          makeFinalizeCmd(receivedPaymentId, intent.id)
        ]);
        await aggregate.flush();

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, ReceivedPaymentFinalizedEvent.name);
        assert.equal(events[1].msgName, PaymentIntentCompletedEvent.name);
        const intentPayload = (events[1] as PaymentIntentCompletedEvent)
          .payload;
        assert.equal(intentPayload.receivedAmount, '100');
        assert.equal(intentPayload.state, 'COMPLETED');

        const stored = repo.getAll().find((p) => p.id === intent.id);
        assert(stored);
        assert.equal(stored.state, 'COMPLETED');
      });

      it('accumulates receivedAmount across multiple finalized payments', async () => {
        const intentId = crypto.randomUUID();
        const rp = (id: string) => ({
          id,
          state: 'FULFILLABLE' as const,
          paymentIntentId: intentId,
          packetId: crypto.randomUUID(),
          peerId: 'peer-1',
          peerAssetCode: 'USD',
          peerAssetScale: 2,
          sourceAmount: 60n,
          receiveAmount: 60n,
          createdAt: new Date(),
          ledgerTransferId: crypto.randomUUID()
        });
        const intent: IPaymentIntent = {
          id: intentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'domain.com/alice',
          receiverWalletAddressId: 'wallet-1',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: 120n,
          quotes: [],
          sentPayments: [],
          receivedPayments: [rp('rp-1'), rp('rp-2')]
        };
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          makeFinalizeCmd('rp-1', intentId),
          makeFinalizeCmd('rp-2', intentId)
        ]);
        await aggregate.flush();

        // rp-1 finalized, rp-2 finalized + intent completed
        assert.equal(events.length, 3);
        assert.equal(events[2].msgName, PaymentIntentCompletedEvent.name);

        const stored = repo.getAll().find((p) => p.id === intentId);
        assert(stored);
        assert.equal(stored.receivedAmount, 120n);
        assert.equal(stored.state, 'COMPLETED');
        assert(stored.receivedPayments.every((r) => r.state === 'FINALIZED'));
      });

      it('fails to finalize from a non-ACCEPTED state', async () => {
        const { intent, receivedPaymentId } = makeIntentWithReceivedPayment({
          receivedPaymentState: 'VALIDATED'
        });
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          makeFinalizeCmd(receivedPaymentId, intent.id)
        ]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });

      it('fails to finalize when the payment intent is missing', async () => {
        const { events } = await aggregate.handleBatch([
          makeFinalizeCmd(crypto.randomUUID(), 'nonexistent')
        ]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails to finalize when the received payment is missing', async () => {
        const { intent } = makeIntentWithReceivedPayment();
        await repo.storeMany([intent]);

        const { events } = await aggregate.handleBatch([
          makeFinalizeCmd('nonexistent', intent.id)
        ]);

        assert.equal(events[0].msgName, ReceivedPaymentFailedEvent.name);
        const payload = (events[0] as ReceivedPaymentFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentNotFoundError');
      });
    });

    describe('handleCreateQuoteCommand (remote url)', () => {
      const REMOTE_URL = 'https://remote.domain.com/incoming-payments/abc';

      beforeEach(() => {
        mockRemotePaymentIntentService.fetchIncomingPayment = async () => ({
          walletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          receivedAmount: 0n,
          destinationIlpAddress: 'g.peer.123',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          sharedSecret: 'stub-shared-secret'
        });
      });

      it('fetches remote intent and emits RemoteQuoteRequestedEvent', async () => {
        const cmd = makeCreateQuoteCmd({
          remoteUrl: REMOTE_URL,
          debitAmount: 500
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteRequestedEvent.name);
        const payload = (events[0] as RemoteQuoteRequestedEvent).payload;
        assert.equal(payload.paymentIntentId, cmd.payload.paymentIntentId);
        assert.equal(payload.quoteId, cmd.payload.id);
        assert.equal(payload.peerId, 'peer-1');
      });

      it('deduplicates intra-batch: second cmd with same url uses first intent id', async () => {
        let fetchCount = 0;
        const originalFetch =
          mockRemotePaymentIntentService.fetchIncomingPayment.bind(
            mockRemotePaymentIntentService
          );
        mockRemotePaymentIntentService.fetchIncomingPayment = async (url) => {
          fetchCount++;
          return originalFetch(url);
        };

        const cmd1 = makeCreateQuoteCmd({
          remoteUrl: REMOTE_URL,
          debitAmount: 100
        });
        const cmd2 = makeCreateQuoteCmd({
          remoteUrl: REMOTE_URL,
          debitAmount: 200
        });
        const { events } = await aggregate.handleBatch([cmd1, cmd2]);

        assert.equal(fetchCount, 1);
        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, RemoteQuoteRequestedEvent.name);
        assert.equal(events[1].msgName, RemoteQuoteRequestedEvent.name);
        const p1 = (events[0] as RemoteQuoteRequestedEvent).payload;
        const p2 = (events[1] as RemoteQuoteRequestedEvent).payload;
        assert.equal(p1.paymentIntentId, cmd1.payload.paymentIntentId);
        assert.equal(p2.paymentIntentId, cmd1.payload.paymentIntentId);
      });

      it('deduplicates cross-batch: uses existing intent id when url already imported', async () => {
        const existingPaymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: [],
          destinationIlpAddress: 'g.peer.123',
          remoteUrl: REMOTE_URL
        };
        await repo.storeMany([existingPaymentIntent]);

        const cmd = makeCreateQuoteCmd({
          remoteUrl: REMOTE_URL,
          debitAmount: 300
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemoteQuoteRequestedEvent.name);
        const payload = (events[0] as RemoteQuoteRequestedEvent).payload;
        assert.equal(payload.paymentIntentId, existingPaymentIntent.id);
      });

      it('emits QuoteCreateFailedEvent when remote fetch throws', async () => {
        mockRemotePaymentIntentService.fetchIncomingPayment = async () => {
          throw new Error('Connection refused');
        };

        const cmd = makeCreateQuoteCmd({ remoteUrl: REMOTE_URL });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.paymentIntentId, cmd.payload.paymentIntentId);
        assert.match(payload.message, /Connection refused/);
      });
    });

    describe('handleCreatePaymentCommand', () => {
      it('fails when sender wallet address not found', async () => {
        const quoteCmd = makeCreatePaymentCmd({
          senderWalletAddressId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreateFailedEvent.name);
        const payload = (events[0] as PaymentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'WalletAddressNotFoundError');
        assert.match(payload.message, /Wallet address nonexistent not found/);
      });

      it('fails when sender wallet address is inactive', async () => {
        mockPalService.addWalletAddress({
          id: 'inactive-sender',
          isActive: false,
          assetCode: 'USD',
          assetScale: 2
        });

        const quoteCmd = makeCreatePaymentCmd({
          senderWalletAddressId: 'inactive-sender'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreateFailedEvent.name);
        const payload = (events[0] as PaymentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'WalletAddressInactiveError');
      });

      it('fails when payment intent not found', async () => {
        const quoteCmd = makeCreatePaymentCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([quoteCmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreateFailedEvent.name);
        const payload = (events[0] as PaymentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails if rates could not be fetched', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'receiver',
          receiverWalletAddressId: crypto.randomUUID(),
          assetCode: 'EUR',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        mockPalService.getRates = async () => null;

        const cmd = makeCreatePaymentCmd({
          paymentIntentId: paymentIntent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreateFailedEvent.name);
        const payload = (events[0] as PaymentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'RatesError');
      });

      it('creates local payment', async () => {
        const paymentIntent: IPaymentIntent = {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'receiver',
          receiverWalletAddressId: crypto.randomUUID(),
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeCreatePaymentCmd({
          paymentIntentId: paymentIntent.id
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreatedEvent.name);
        assert.equal(
          (events[0] as PaymentCreatedEvent).payload.id,
          cmd.payload.id
        );
      });

      it('creates remote payment from a completed quote', async () => {
        const paymentIntentId = crypto.randomUUID();
        const quoteId = crypto.randomUUID();
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [
            {
              id: quoteId,
              state: 'COMPLETED',
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              debitAmount: 500n,
              receiveAmount: 100n,
              exchangeRate: 0.2,
              expiresAt: new Date(Date.now() + 60_000)
            }
          ],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeCreatePaymentCmd({
          paymentIntentId,
          quoteId
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreatedEvent.name);
        const payload = (events[0] as PaymentCreatedEvent).payload;
        assert.equal(payload.id, cmd.payload.id);
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.debitAmount, '500');
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.state, 'CREATED');
      });

      it('fails remote payment when quoteId is missing', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          sentPayments: [],
          receivedPayments: []
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeCreatePaymentCmd({
          paymentIntentId,
          quoteId: undefined
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCreateFailedEvent.name);
        const payload = (events[0] as PaymentCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'InvalidQuoteIdError');
        assert.match(payload.message, /requires a quoteId/);
      });
    });

    describe('handlePaymentApproveCommand', () => {
      it('fails when payment intent not found', async () => {
        const cmd = makeApprovePaymentCmd({
          paymentIntentId: 'nonexistent'
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('completes local payment', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'receiver',
          receiverWalletAddressId: crypto.randomUUID(),
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 1000),
          incomingAmount: 100n,
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: 'CREATED',
              senderWalletAddress: 'sender',
              senderWalletAddressId: crypto.randomUUID(),
              assetCode: 'USD',
              paymentIntentId: paymentIntentId,
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 100n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeApprovePaymentCmd({
          id: paymentId,
          paymentIntentId: paymentIntentId
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, PaymentCompletedEvent.name);
        assert.equal(
          (events[0] as PaymentCompletedEvent).payload.id,
          paymentId
        );
        assert.equal(events[1].msgName, PaymentIntentCompletedEvent.name);
        assert.equal(
          (events[1] as PaymentIntentCompletedEvent).payload.id,
          paymentIntentId
        );
      });

      it('approves remote payment: emits RemotePaymentSendApprovedEvent and persists PROCESSING', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const quoteId = crypto.randomUUID();
        const senderWalletAddressId = 'wallet-1';
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [
            {
              id: quoteId,
              state: 'COMPLETED',
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId,
              debitAmount: 500n,
              receiveAmount: 100n,
              exchangeRate: 0.2,
              expiresAt: new Date(Date.now() + 60_000)
            }
          ],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: 'CREATED',
              quoteId,
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId,
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeApprovePaymentCmd({
          id: paymentId,
          paymentIntentId
        });
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemotePaymentSendApprovedEvent.name);
        const payload = (events[0] as RemotePaymentSendApprovedEvent).payload;
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.paymentId, paymentId);
        assert.equal(payload.destinationIlpAddress, 'g.peer.123');
        assert.equal(payload.debitAmount, '500');
        assert.equal(payload.assetCode, 'USD');
        assert.equal(payload.assetScale, 2);
        assert.equal(payload.senderWalletAddressId, senderWalletAddressId);

        const stored = repo
          .getAll()
          .find((intent) => intent.id === paymentIntentId);
        assert.ok(stored);
        const storedPayment = stored.sentPayments.find(
          (p) => p.id === paymentId
        );
        assert.ok(storedPayment);
        assert.equal(storedPayment.state, 'PROCESSING');
        assert.equal(storedPayment.ledgerTransferId, undefined);
      });

      it('fails to approve remote payment if intent has no destinationIlpAddress', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: 'CREATED',
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeApprovePaymentCmd({
          id: paymentId,
          paymentIntentId
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'MissingDestinationIlpAddressError');
      });

      it('fails to approve remote payment when payment is already PROCESSING', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: 'PROCESSING',
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
        await repo.storeMany([paymentIntent]);

        const cmd = makeApprovePaymentCmd({
          id: paymentId,
          paymentIntentId
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handlePrepareRemotePaymentCommand', () => {
      function makeRemoteIntentWithPayment(
        paymentIntentId: string,
        paymentId: string,
        paymentState: 'PROCESSING' | 'SENDING' | 'CREATED'
      ): IPaymentIntent {
        return {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          remoteUrl: 'https://remote.domain.com/incoming-payments/abc',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: paymentState,
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
      }

      beforeEach(() => {
        mockRemotePaymentIntentService.fetchIncomingPayment = async () => ({
          walletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          receivedAmount: 0n,
          destinationIlpAddress: 'g.peer.123',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          sharedSecret: 'fresh-per-prepare-secret'
        });
      });

      it('transitions PROCESSING to SENDING, persists ledgerTransferId, and emits RemotePaymentPreparedEvent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent = makeRemoteIntentWithPayment(
          paymentIntentId,
          paymentId,
          'PROCESSING'
        );
        await repo.storeMany([paymentIntent]);

        const palTransferId = 'ledger-pal-mint-123';
        const cmd = new PrepareRemotePaymentCmd(
          {
            paymentIntentId,
            paymentId,
            ledgerTransferId: palTransferId
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemotePaymentPreparedEvent.name);
        const payload = (events[0] as RemotePaymentPreparedEvent).payload;
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.paymentId, paymentId);
        assert.equal(payload.ledgerTransferId, palTransferId);
        assert.equal(payload.destinationIlpAddress, 'g.peer.123');
        assert.equal(payload.debitAmount, '500');
        assert.equal(payload.receiveAmount, '100');
        assert.equal(payload.sharedSecret, 'fresh-per-prepare-secret');

        const storedPayment = repo
          .getAll()
          .find((i) => i.id === paymentIntentId)
          ?.sentPayments.find((p) => p.id === paymentId);
        assert.equal(storedPayment?.state, 'SENDING');
        assert.equal(storedPayment?.ledgerTransferId, palTransferId);
      });

      it('fails to prepare if payment intent not found', async () => {
        const cmd = new PrepareRemotePaymentCmd(
          {
            paymentIntentId: crypto.randomUUID(),
            paymentId: crypto.randomUUID(),
            ledgerTransferId: 'ledger-1'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('fails when payment state is not PROCESSING', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent = makeRemoteIntentWithPayment(
          paymentIntentId,
          paymentId,
          'SENDING'
        );
        await repo.storeMany([paymentIntent]);

        const cmd = new PrepareRemotePaymentCmd(
          {
            paymentIntentId,
            paymentId,
            ledgerTransferId: 'ledger-1'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handleFailRemotePaymentCommand', () => {
      function makeRemoteIntentWithPayment(
        paymentIntentId: string,
        paymentId: string,
        paymentState: 'PROCESSING' | 'FAILED' | 'CREATED'
      ): IPaymentIntent {
        return {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: paymentState,
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
      }

      it('transitions PROCESSING to FAILED and emits PaymentFailedEvent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent = makeRemoteIntentWithPayment(
          paymentIntentId,
          paymentId,
          'PROCESSING'
        );
        await repo.storeMany([paymentIntent]);

        const cmd = new FailRemotePaymentCmd(
          {
            paymentIntentId,
            paymentId,
            reason: 'Insufficient funds'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentFailedEvent.name);
        const payload = (events[0] as PaymentFailedEvent).payload;
        assert.equal(payload.id, paymentId);
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.state, 'FAILED');
        assert.equal(payload.reason, 'Insufficient funds');

        const storedPayment = repo
          .getAll()
          .find((i) => i.id === paymentIntentId)
          ?.sentPayments.find((p) => p.id === paymentId);
        assert.equal(storedPayment?.state, 'FAILED');
        assert.equal(storedPayment?.failReason, 'Insufficient funds');
      });

      it('fails when payment state is not PROCESSING', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent = makeRemoteIntentWithPayment(
          paymentIntentId,
          paymentId,
          'CREATED'
        );
        await repo.storeMany([paymentIntent]);

        const cmd = new FailRemotePaymentCmd(
          {
            paymentIntentId,
            paymentId,
            reason: 'nope'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handleConfirmRemotePaymentCommand', () => {
      function makeRemoteIntentWithPayment(
        paymentIntentId: string,
        paymentId: string,
        paymentState: 'SENDING' | 'CONFIRMED' | 'PROCESSING'
      ): IPaymentIntent {
        return {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: paymentState,
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n,
              ledgerTransferId: 'ledger-pal-1'
            }
          ]
        };
      }

      it('transitions SENDING to CONFIRMED and emits RemotePaymentSendConfirmedEvent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(paymentIntentId, paymentId, 'SENDING')
        ]);

        const cmd = new ConfirmRemotePaymentCmd(
          { paymentIntentId, paymentId },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemotePaymentSendConfirmedEvent.name);
        const payload = (events[0] as RemotePaymentSendConfirmedEvent).payload;
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.paymentId, paymentId);
        assert.equal(payload.ledgerTransferId, 'ledger-pal-1');

        const stored = repo
          .getAll()
          .find((i) => i.id === paymentIntentId)
          ?.sentPayments.find((p) => p.id === paymentId);
        assert.equal(stored?.state, 'CONFIRMED');
      });

      it('fails when payment state is not SENDING', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(paymentIntentId, paymentId, 'PROCESSING')
        ]);

        const cmd = new ConfirmRemotePaymentCmd(
          { paymentIntentId, paymentId },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });

      it('fails when payment intent not found', async () => {
        const cmd = new ConfirmRemotePaymentCmd(
          {
            paymentIntentId: crypto.randomUUID(),
            paymentId: crypto.randomUUID()
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });
    });

    describe('handleRejectRemotePaymentCommand', () => {
      function makeRemoteIntentWithPayment(
        paymentIntentId: string,
        paymentId: string,
        paymentState: 'SENDING' | 'REJECTED' | 'PROCESSING' | 'CONFIRMED'
      ): IPaymentIntent {
        return {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: paymentState,
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n,
              ledgerTransferId: 'ledger-pal-1'
            }
          ]
        };
      }

      it('transitions SENDING to REJECTED, persists failReason, and emits RemotePaymentSendRejectedEvent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(paymentIntentId, paymentId, 'SENDING')
        ]);

        const cmd = new RejectRemotePaymentCmd(
          { paymentIntentId, paymentId, reason: 'REJECTED' },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, RemotePaymentSendRejectedEvent.name);
        const payload = (events[0] as RemotePaymentSendRejectedEvent).payload;
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.paymentId, paymentId);
        assert.equal(payload.ledgerTransferId, 'ledger-pal-1');
        assert.equal(payload.reason, 'REJECTED');

        const stored = repo
          .getAll()
          .find((i) => i.id === paymentIntentId)
          ?.sentPayments.find((p) => p.id === paymentId);
        assert.equal(stored?.state, 'REJECTED');
        assert.equal(stored?.failReason, 'REJECTED');
      });

      it('fails when payment state is not SENDING', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(paymentIntentId, paymentId, 'CONFIRMED')
        ]);

        const cmd = new RejectRemotePaymentCmd(
          { paymentIntentId, paymentId, reason: 'REJECTED' },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handleCompleteRemotePaymentCommand', () => {
      function makeRemoteIntentWithPayment(
        paymentIntentId: string,
        paymentId: string,
        paymentState: 'CONFIRMED' | 'SENDING' | 'PROCESSING',
        incomingAmount: bigint | null = null
      ): IPaymentIntent {
        return {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: paymentState,
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n,
              ledgerTransferId: 'ledger-pal-1'
            }
          ]
        };
      }

      it('transitions CONFIRMED to COMPLETED and emits PaymentCompletedEvent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(paymentIntentId, paymentId, 'CONFIRMED')
        ]);

        const cmd = new CompleteRemotePaymentCmd(
          { paymentIntentId, paymentId },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompletedEvent.name);
        const payload = (events[0] as PaymentCompletedEvent).payload;
        assert.equal(payload.id, paymentId);
        assert.equal(payload.paymentIntentId, paymentIntentId);
        assert.equal(payload.state, 'COMPLETED');
        assert.equal(payload.sentAmount, '500');

        const stored = repo.getAll().find((i) => i.id === paymentIntentId);
        const storedPayment = stored?.sentPayments.find(
          (p) => p.id === paymentId
        );
        assert.equal(storedPayment?.state, 'COMPLETED');
        assert.equal(storedPayment?.sentAmount, 500n);
        assert.equal(stored?.receivedAmount, 100n);
      });

      it('also emits PaymentIntentCompletedEvent when incomingAmount met', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(
            paymentIntentId,
            paymentId,
            'CONFIRMED',
            100n
          )
        ]);

        const cmd = new CompleteRemotePaymentCmd(
          { paymentIntentId, paymentId },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, PaymentCompletedEvent.name);
        assert.equal(events[1].msgName, PaymentIntentCompletedEvent.name);
        const intentPayload = (events[1] as PaymentIntentCompletedEvent)
          .payload;
        assert.equal(intentPayload.id, paymentIntentId);
        assert.equal(intentPayload.state, 'COMPLETED');

        const stored = repo.getAll().find((i) => i.id === paymentIntentId);
        assert.equal(stored?.state, 'COMPLETED');
      });

      it('fails when payment state is not CONFIRMED', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeRemoteIntentWithPayment(paymentIntentId, paymentId, 'SENDING')
        ]);

        const cmd = new CompleteRemotePaymentCmd(
          { paymentIntentId, paymentId },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCompleteFailedEvent.name);
        const payload = (events[0] as PaymentCompleteFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });
    });

    describe('handleFailRemotePaymentCommand from REJECTED source', () => {
      it('transitions REJECTED to FAILED and emits PaymentFailedEvent', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        const paymentIntent: IPaymentIntent = {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          destinationIlpAddress: 'g.peer.123',
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: 'REJECTED',
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              paymentIntentId,
              assetCode: 'USD',
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 500n,
              receiveAmount: 100n,
              sentAmount: 0n,
              ledgerTransferId: 'ledger-pal-1',
              failReason: 'EXPIRED'
            }
          ]
        };
        await repo.storeMany([paymentIntent]);

        const cmd = new FailRemotePaymentCmd(
          {
            paymentIntentId,
            paymentId,
            reason: 'PAL voided reserved transfer'
          },
          crypto.randomUUID()
        );
        const { events } = await aggregate.handleBatch([cmd]);
        await aggregate.flush();

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentFailedEvent.name);
        const payload = (events[0] as PaymentFailedEvent).payload;
        assert.equal(payload.id, paymentId);
        assert.equal(payload.state, 'FAILED');
        assert.equal(payload.reason, 'PAL voided reserved transfer');

        const storedPayment = repo
          .getAll()
          .find((i) => i.id === paymentIntentId)
          ?.sentPayments.find((p) => p.id === paymentId);
        assert.equal(storedPayment?.state, 'FAILED');
        assert.equal(storedPayment?.failReason, 'PAL voided reserved transfer');
      });
    });

    describe('handleCancelPaymentCommand', () => {
      function makeLocalIntentWithPayment(
        paymentIntentId: string,
        paymentId: string,
        paymentState: SentPaymentState
      ): IPaymentIntent {
        return {
          id: paymentIntentId,
          receivedAmount: 0n,
          receiverWalletAddress: 'receiver',
          receiverWalletAddressId: crypto.randomUUID(),
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'LOCAL',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: 100n,
          quotes: [],
          receivedPayments: [],
          sentPayments: [
            {
              id: paymentId,
              state: paymentState,
              senderWalletAddress: 'sender',
              senderWalletAddressId: crypto.randomUUID(),
              assetCode: 'USD',
              paymentIntentId,
              assetScale: 2,
              createdAt: new Date(),
              debitAmount: 100n,
              receiveAmount: 100n,
              sentAmount: 0n
            }
          ]
        };
      }

      it('fails when payment intent not found', async () => {
        const cmd = makeCancelPaymentCmd({ paymentIntentId: 'nonexistent' });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCancelFailedEvent.name);
        const payload = (events[0] as PaymentCancelFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentIntentNotFoundError');
      });

      it('cancels a created payment', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeLocalIntentWithPayment(paymentIntentId, paymentId, 'CREATED')
        ]);

        const cmd = makeCancelPaymentCmd({ id: paymentId, paymentIntentId });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCancelledEvent.name);
        assert.equal(
          (events[0] as PaymentCancelledEvent).payload.id,
          paymentId
        );
      });

      it('fails when payment is already completed', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeLocalIntentWithPayment(paymentIntentId, paymentId, 'COMPLETED')
        ]);

        const cmd = makeCancelPaymentCmd({ id: paymentId, paymentIntentId });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, PaymentCancelFailedEvent.name);
        const payload = (events[0] as PaymentCancelFailedEvent).payload;
        assert.equal(payload.errorName, 'PaymentInvalidStateError');
      });

      it('persists the cancelled payment state after flush', async () => {
        const paymentIntentId = crypto.randomUUID();
        const paymentId = crypto.randomUUID();
        await repo.storeMany([
          makeLocalIntentWithPayment(paymentIntentId, paymentId, 'CREATED')
        ]);

        const beforeCancel = Date.now();
        const cmd = makeCancelPaymentCmd({
          id: paymentId,
          paymentIntentId,
          reason: 'user requested'
        });
        await aggregate.handleBatch([cmd]);
        await aggregate.flush();
        const afterCancel = Date.now();

        const storedPayment = repo
          .getAll()
          .find((intent) => intent.id === paymentIntentId)
          ?.sentPayments.find((p) => p.id === paymentId);
        assert.equal(storedPayment?.state, 'CANCELLED');
        assert.equal(storedPayment?.cancelReason, 'user requested');
        assert.ok(storedPayment?.cancelledAt);
        assert.ok(storedPayment.cancelledAt.getTime() >= beforeCancel);
        assert.ok(storedPayment.cancelledAt.getTime() <= afterCancel);
      });
    });

    describe('prefetch (peers & FX)', () => {
      function makeRemoteIntentWithIlp(ilpAddress: string): IPaymentIntent {
        return {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'USD',
          assetScale: 2,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [],
          sentPayments: [],
          receivedPayments: [],
          destinationIlpAddress: ilpAddress
        };
      }

      function makeCrossAssetPendingQuoteIntent(
        quoteId: string,
        amountOverride: { debitAmount: bigint } | { receiveAmount: bigint }
      ): IPaymentIntent {
        return {
          id: crypto.randomUUID(),
          receivedAmount: 0n,
          receiverWalletAddress: 'remote.domain.com/alice',
          assetCode: 'XRP',
          assetScale: 6,
          state: 'CREATED',
          destination: 'REMOTE',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 60_000),
          incomingAmount: null,
          quotes: [
            {
              id: quoteId,
              state: 'PENDING',
              senderWalletAddress: 'domain.com/bob',
              senderWalletAddressId: 'wallet-1',
              peerId: 'peer-1',
              peerAssetCode: 'EUR',
              peerAssetScale: 2,
              sourceAmount: 100n,
              senderAssetCode: 'USD',
              ...amountOverride
            }
          ],
          sentPayments: [],
          receivedPayments: [],
          destinationIlpAddress: 'g.peer.123'
        };
      }

      function makeCompleteRemoteQuoteCmd(
        overrides: Partial<{
          paymentIntentId: string;
          quoteId: string;
          receiveAmountValue: string;
        }> = {}
      ): CompleteRemoteQuoteCmd {
        return new CompleteRemoteQuoteCmd(
          {
            paymentIntentId: overrides.paymentIntentId ?? crypto.randomUUID(),
            quoteId: overrides.quoteId ?? crypto.randomUUID(),
            receiveAmountValue: overrides.receiveAmountValue ?? '10000'
          },
          crypto.randomUUID()
        );
      }

      it('peer dedup: two CreateQuoteCmds with same ILP address fetch peer once', async () => {
        const intentA = makeRemoteIntentWithIlp('g.peer.same');
        const intentB = makeRemoteIntentWithIlp('g.peer.same');
        await repo.storeMany([intentA, intentB]);

        let callCount = 0;
        mockPalService.getPeerByIlpAddress = async () => {
          callCount++;
          return { peerId: 'peer-1', assetCode: 'USD', assetScale: 2 };
        };

        const cmdA = makeCreateQuoteCmd({ paymentIntentId: intentA.id });
        const cmdB = makeCreateQuoteCmd({ paymentIntentId: intentB.id });
        const { events } = await aggregate.handleBatch([cmdA, cmdB]);

        assert.equal(callCount, 1);
        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, RemoteQuoteRequestedEvent.name);
        assert.equal(events[1].msgName, RemoteQuoteRequestedEvent.name);
      });

      it('FX dedup: two CompleteRemoteQuoteCmds with same (peer, direction, asset) fetch rate once', async () => {
        const quoteIdA = crypto.randomUUID();
        const quoteIdB = crypto.randomUUID();
        const intentA = makeCrossAssetPendingQuoteIntent(quoteIdA, {
          debitAmount: 1000n
        });
        const intentB = makeCrossAssetPendingQuoteIntent(quoteIdB, {
          debitAmount: 2000n
        });
        await repo.storeMany([intentA, intentB]);

        let callCount = 0;
        mockPalService.getRates = async () => {
          callCount++;
          return 0.9;
        };

        const cmdA = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intentA.id,
          quoteId: quoteIdA
        });
        const cmdB = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intentB.id,
          quoteId: quoteIdB
        });
        const { events } = await aggregate.handleBatch([cmdA, cmdB]);

        assert.equal(callCount, 1);
        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, QuoteCompletedEvent.name);
        assert.equal(events[1].msgName, QuoteCompletedEvent.name);
      });

      it('FX direction split: same peer/asset with debit and receive triggers two distinct fetches', async () => {
        const quoteIdA = crypto.randomUUID();
        const quoteIdB = crypto.randomUUID();
        const intentA = makeCrossAssetPendingQuoteIntent(quoteIdA, {
          debitAmount: 1000n
        });
        const intentB = makeCrossAssetPendingQuoteIntent(quoteIdB, {
          receiveAmount: 1000n
        });
        await repo.storeMany([intentA, intentB]);

        const calls: Array<Record<string, unknown>> = [];
        mockPalService.getRates = async (req) => {
          calls.push(req as unknown as Record<string, unknown>);
          return 0.9;
        };

        const cmdA = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intentA.id,
          quoteId: quoteIdA
        });
        const cmdB = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intentB.id,
          quoteId: quoteIdB
        });
        await aggregate.handleBatch([cmdA, cmdB]);

        assert.equal(calls.length, 2);
        assert.ok(
          calls.some(
            (c) => 'sourceAssetCode' in c && c.sourceAssetCode === 'USD'
          )
        );
        assert.ok(
          calls.some(
            (c) =>
              'destinationAssetCode' in c && c.destinationAssetCode === 'USD'
          )
        );
      });

      it('peer fetch error isolates to dependent command only', async () => {
        const intentA = makeRemoteIntentWithIlp('g.peer.fails.p1');
        const intentB = makeRemoteIntentWithIlp('g.peer.ok.p2');
        await repo.storeMany([intentA, intentB]);

        mockPalService.getPeerByIlpAddress = async (ilp) => {
          if (ilp === 'g.peer.fails') throw new Error('peer service down');
          return { peerId: 'peer-1', assetCode: 'USD', assetScale: 2 };
        };

        const cmdA = makeCreateQuoteCmd({ paymentIntentId: intentA.id });
        const cmdB = makeCreateQuoteCmd({ paymentIntentId: intentB.id });
        const { events } = await aggregate.handleBatch([cmdA, cmdB]);

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const failed = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(failed.errorName, 'Error');
        assert.equal(failed.message, 'peer service down');
        assert.equal(events[1].msgName, RemoteQuoteRequestedEvent.name);
      });

      it('FX fetch error isolates to dependent command only', async () => {
        const quoteIdA = crypto.randomUUID();
        const quoteIdB = crypto.randomUUID();
        const intentA = makeCrossAssetPendingQuoteIntent(quoteIdA, {
          debitAmount: 1000n
        });
        // intentB takes the same-asset path; doesn't go through FX prefetch
        const intentB = makeRemotePaymentIntentWithPendingQuote(quoteIdB);
        await repo.storeMany([intentA, intentB]);

        mockPalService.getRates = async () => {
          throw new Error('fx service down');
        };

        const cmdA = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intentA.id,
          quoteId: quoteIdA
        });
        const cmdB = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intentB.id,
          quoteId: quoteIdB
        });
        const { events } = await aggregate.handleBatch([cmdA, cmdB]);

        assert.equal(events.length, 2);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const failed = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(failed.errorName, 'Error');
        assert.equal(failed.message, 'fx service down');
        assert.equal(events[1].msgName, QuoteCompletedEvent.name);
      });

      it('null peer produces PeerNotFoundError', async () => {
        const intent = makeRemoteIntentWithIlp('g.peer.none');
        await repo.storeMany([intent]);

        mockPalService.getPeerByIlpAddress = async () => null;

        const cmd = makeCreateQuoteCmd({ paymentIntentId: intent.id });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'PeerNotFoundError');
      });

      it('null FX rate produces RatesError', async () => {
        const quoteId = crypto.randomUUID();
        const intent = makeCrossAssetPendingQuoteIntent(quoteId, {
          debitAmount: 1000n
        });
        await repo.storeMany([intent]);

        mockPalService.getRates = async () => null;

        const cmd = makeCompleteRemoteQuoteCmd({
          paymentIntentId: intent.id,
          quoteId
        });
        const { events } = await aggregate.handleBatch([cmd]);

        assert.equal(events.length, 1);
        assert.equal(events[0].msgName, QuoteCreateFailedEvent.name);
        const payload = (events[0] as QuoteCreateFailedEvent).payload;
        assert.equal(payload.errorName, 'RatesError');
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

    it('stores a remote payment intent created during quote', async () => {
      const REMOTE_URL = 'https://remote.domain.com/incoming-payments/abc';
      mockRemotePaymentIntentService.fetchIncomingPayment = async () => ({
        walletAddress: 'remote.domain.com/alice',
        assetCode: 'USD',
        assetScale: 2,
        receivedAmount: 0n,
        destinationIlpAddress: 'g.peer.123',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharedSecret: 'stub-shared-secret'
      });

      const cmd = makeCreateQuoteCmd({ remoteUrl: REMOTE_URL });
      await aggregate.handleBatch([cmd]);
      await aggregate.flush();

      const stored = repo.getAll();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, cmd.payload.paymentIntentId);
      assert.equal(stored[0].destination, 'REMOTE');
      assert.equal(stored[0].remoteUrl, REMOTE_URL);
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
      assert.equal(
        (events[0] as QuoteCompletedEvent).payload.paymentIntentId,
        paymentIntentId
      );

      await aggregate.flush();

      const stored = repo.getAll();
      assert.equal(stored.length, 1);
      assert.equal(stored[0].id, paymentIntentId);
      assert.equal(stored[0].quotes.length, 1);
      assert.equal(stored[0].quotes[0].id, quoteId);
    });
  });
});
