'use strict';

import { after, before, describe, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { ConsoleLogger } from 'common-types-lib';
import {
  InvalidCursorError,
  IPaymentIntent,
  ISentPayment
} from 'payments-domain-lib';
import { MongoDbPaymentIntentRepo } from '../src';

const MONGODB_URL =
  process.env['MONGODB_URL'] || 'mongodb://root:mongoPass@localhost:27017';

// Fixed base instant; ties are created by reusing the exact same ms.
const T0 = Date.parse('2026-01-01T00:00:00.000Z');

describe('MongoDbPaymentIntentRepo keyset pagination', () => {
  const repo = new MongoDbPaymentIntentRepo(MONGODB_URL, new ConsoleLogger());

  // Unique per run so reruns against a shared DB never collide on the
  // unique id index, and filter-scoped queries stay isolated.
  const run = randomUUID();
  const receiverWalletAddressId = randomUUID();
  const otherWalletAddressId = randomUUID();
  const senderWalletAddressId = randomUUID();
  const intentA = `${run}-intent-a`;
  const intentB = `${run}-intent-b`;

  // Ids are chosen so their lexicographic order is known — the keyset
  // tiebreaker sorts by id within identical createdAt values.
  const iid = (n: number) => `${run}-i-0${n}`;
  const pid = (n: number) => `${run}-p-0${n}`;

  function makeIntent(args: {
    id: string;
    walletAddressId: string;
    createdAt: Date;
  }): IPaymentIntent {
    return {
      id: args.id,
      receiverWalletAddressId: args.walletAddressId,
      receiverWalletAddress: 'test.com/page-receiver',
      state: 'CREATED',
      destination: 'LOCAL',
      assetCode: 'USD',
      assetScale: 2,
      createdAt: args.createdAt,
      expiresAt: new Date(T0 + 86_400_000),
      incomingAmount: 100n,
      receivedAmount: 0n,
      quotes: [],
      sentPayments: [],
      inboundPayments: []
    };
  }

  function makeSentPayment(args: {
    id: string;
    paymentIntentId: string;
    createdAt: Date;
  }): ISentPayment {
    return {
      id: args.id,
      state: 'CREATED',
      senderWalletAddress: 'test.com/page-sender',
      senderWalletAddressId,
      paymentIntentId: args.paymentIntentId,
      assetCode: 'USD',
      assetScale: 2,
      createdAt: args.createdAt,
      debitAmount: 100n,
      receiveAmount: 100n,
      sentAmount: 0n
    };
  }

  before(async () => {
    await repo.init();

    // Six intents; (createdAt, id) ascending order is i1..i6.
    // Ties: i1/i2 share T0; i4/i5 share T0+2ms.
    await repo.storeMany([
      makeIntent({
        id: iid(1),
        walletAddressId: receiverWalletAddressId,
        createdAt: new Date(T0)
      }),
      makeIntent({
        id: iid(2),
        walletAddressId: receiverWalletAddressId,
        createdAt: new Date(T0)
      }),
      makeIntent({
        id: iid(3),
        walletAddressId: receiverWalletAddressId,
        createdAt: new Date(T0 + 1)
      }),
      makeIntent({
        id: iid(4),
        walletAddressId: receiverWalletAddressId,
        createdAt: new Date(T0 + 2)
      }),
      makeIntent({
        id: iid(5),
        walletAddressId: receiverWalletAddressId,
        createdAt: new Date(T0 + 2)
      }),
      makeIntent({
        id: iid(6),
        walletAddressId: receiverWalletAddressId,
        createdAt: new Date(T0 + 3)
      }),
      // Another wallet address, created before everything above — used to
      // prove filtering and cross-filter cursor behavior.
      makeIntent({
        id: `${run}-other`,
        walletAddressId: otherWalletAddressId,
        createdAt: new Date(T0 - 1000)
      })
    ]);

    // Five sent payments across two intents; ascending order is p1..p5.
    // Ties: p1/p2 share T0; p4/p5 share T0+2ms.
    const payments = [
      makeSentPayment({
        id: pid(1),
        paymentIntentId: intentA,
        createdAt: new Date(T0)
      }),
      makeSentPayment({
        id: pid(2),
        paymentIntentId: intentB,
        createdAt: new Date(T0)
      }),
      makeSentPayment({
        id: pid(3),
        paymentIntentId: intentA,
        createdAt: new Date(T0 + 1)
      }),
      makeSentPayment({
        id: pid(4),
        paymentIntentId: intentB,
        createdAt: new Date(T0 + 2)
      }),
      makeSentPayment({
        id: pid(5),
        paymentIntentId: intentA,
        createdAt: new Date(T0 + 2)
      })
    ];
    const carrier = makeIntent({
      id: `${run}-carrier`,
      walletAddressId: otherWalletAddressId,
      createdAt: new Date(T0)
    });
    carrier.sentPayments = payments;
    await repo.storeSentPayments([
      { paymentIds: payments.map((p) => p.id), paymentIntent: carrier }
    ]);
  });

  after(async () => {
    await repo.destroy();
  });

  function fetchIntents(opts: {
    cursor?: string;
    limit: number;
    backwards: boolean;
    walletAddressId?: string;
  }) {
    return repo.fetchPaymentIntentsPage({
      walletAddressId: opts.walletAddressId ?? receiverWalletAddressId,
      cursor: opts.cursor,
      limit: opts.limit,
      backwards: opts.backwards
    });
  }

  describe('fetchPaymentIntentsPage', () => {
    test('returns all items in (createdAt, id) ascending order', async () => {
      const page = await fetchIntents({ limit: 10, backwards: false });
      assert.deepEqual(
        page.items.map((i) => i.id),
        [iid(1), iid(2), iid(3), iid(4), iid(5), iid(6)]
      );
      assert.equal(page.hasNextPage, false);
      assert.equal(page.hasPreviousPage, false);
    });

    test('hasNextPage is false when items exactly fill the limit', async () => {
      const exact = await fetchIntents({ limit: 6, backwards: false });
      assert.equal(exact.items.length, 6);
      assert.equal(exact.hasNextPage, false);

      const under = await fetchIntents({ limit: 5, backwards: false });
      assert.equal(under.items.length, 5);
      assert.equal(under.hasNextPage, true);
    });

    test('forward cursor splits a createdAt tie by id', async () => {
      // i1 and i2 share the same createdAt — paging after i1 must still
      // return i2 (the id tiebreaker branch of the range query).
      const afterFirst = await fetchIntents({
        cursor: iid(1),
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        afterFirst.items.map((i) => i.id),
        [iid(2), iid(3), iid(4), iid(5), iid(6)]
      );

      // i4 and i5 share createdAt — paging after i4 returns i5 onward.
      const afterMidTie = await fetchIntents({
        cursor: iid(4),
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        afterMidTie.items.map((i) => i.id),
        [iid(5), iid(6)]
      );
    });

    test('forward pages walk the full set without gaps or duplicates', async () => {
      const page1 = await fetchIntents({ limit: 2, backwards: false });
      assert.deepEqual(
        page1.items.map((i) => i.id),
        [iid(1), iid(2)]
      );
      assert.equal(page1.hasNextPage, true);
      assert.equal(page1.hasPreviousPage, false);

      const page2 = await fetchIntents({
        cursor: page1.items[1].id,
        limit: 2,
        backwards: false
      });
      assert.deepEqual(
        page2.items.map((i) => i.id),
        [iid(3), iid(4)]
      );
      assert.equal(page2.hasNextPage, true);
      assert.equal(page2.hasPreviousPage, true);

      const page3 = await fetchIntents({
        cursor: page2.items[1].id,
        limit: 2,
        backwards: false
      });
      assert.deepEqual(
        page3.items.map((i) => i.id),
        [iid(5), iid(6)]
      );
      assert.equal(page3.hasNextPage, false);
      assert.equal(page3.hasPreviousPage, true);
    });

    test('backwards returns the window immediately before the cursor, ascending', async () => {
      const page = await fetchIntents({
        cursor: iid(6),
        limit: 2,
        backwards: true
      });
      assert.deepEqual(
        page.items.map((i) => i.id),
        [iid(4), iid(5)]
      );
      assert.equal(page.hasPreviousPage, true);
      assert.equal(page.hasNextPage, true);
    });

    test('backwards cursor splits a createdAt tie by id', async () => {
      // i2 shares createdAt with i1 — backwards from i2 must return only i1.
      const beforeSecond = await fetchIntents({
        cursor: iid(2),
        limit: 10,
        backwards: true
      });
      assert.deepEqual(
        beforeSecond.items.map((i) => i.id),
        [iid(1)]
      );
      assert.equal(beforeSecond.hasPreviousPage, false);
      assert.equal(beforeSecond.hasNextPage, true);

      // i5 shares createdAt with i4 — backwards from i5 includes i4.
      const beforeMidTie = await fetchIntents({
        cursor: iid(5),
        limit: 10,
        backwards: true
      });
      assert.deepEqual(
        beforeMidTie.items.map((i) => i.id),
        [iid(1), iid(2), iid(3), iid(4)]
      );
      assert.equal(beforeMidTie.hasPreviousPage, false);
      assert.equal(beforeMidTie.hasNextPage, true);
    });

    test('unknown cursor throws InvalidCursorError', async () => {
      await assert.rejects(
        fetchIntents({ cursor: randomUUID(), limit: 2, backwards: false }),
        InvalidCursorError
      );
    });

    test('cursor is resolved globally, results still honor the filter', async () => {
      // The boundary doc belongs to another wallet address and predates all
      // of ours — paging forward from it returns our full filtered set.
      const page = await fetchIntents({
        cursor: `${run}-other`,
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        page.items.map((i) => i.id),
        [iid(1), iid(2), iid(3), iid(4), iid(5), iid(6)]
      );
    });

    test('filter excludes other wallet addresses', async () => {
      const page = await fetchIntents({
        walletAddressId: otherWalletAddressId,
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        page.items.map((i) => i.id),
        [`${run}-other`]
      );
    });

    test('unknown wallet address yields an empty page', async () => {
      const page = await fetchIntents({
        walletAddressId: randomUUID(),
        limit: 10,
        backwards: false
      });
      assert.deepEqual(page.items, []);
      assert.equal(page.hasNextPage, false);
      assert.equal(page.hasPreviousPage, false);
    });
  });

  describe('fetchSentPaymentsPage', () => {
    test('returns all items in (createdAt, id) ascending order', async () => {
      const page = await repo.fetchSentPaymentsPage({
        walletAddressId: senderWalletAddressId,
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        page.items.map((p) => p.id),
        [pid(1), pid(2), pid(3), pid(4), pid(5)]
      );
      assert.equal(page.hasNextPage, false);
      assert.equal(page.hasPreviousPage, false);
      for (const payment of page.items) {
        assert.equal(payment.senderWalletAddressId, senderWalletAddressId);
        assert.equal(Number(payment.debitAmount), 100);
      }
    });

    test('forward and backward tie-splitting', async () => {
      // p1/p2 share createdAt.
      const afterFirst = await repo.fetchSentPaymentsPage({
        walletAddressId: senderWalletAddressId,
        cursor: pid(1),
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        afterFirst.items.map((p) => p.id),
        [pid(2), pid(3), pid(4), pid(5)]
      );

      // p4/p5 share createdAt — backwards from p5 includes p4.
      const beforeLast = await repo.fetchSentPaymentsPage({
        walletAddressId: senderWalletAddressId,
        cursor: pid(5),
        limit: 2,
        backwards: true
      });
      assert.deepEqual(
        beforeLast.items.map((p) => p.id),
        [pid(3), pid(4)]
      );
      assert.equal(beforeLast.hasPreviousPage, true);
      assert.equal(beforeLast.hasNextPage, true);
    });

    test('filters by paymentIntentId, alone and combined with pagination', async () => {
      const page = await repo.fetchSentPaymentsPage({
        walletAddressId: senderWalletAddressId,
        paymentIntentId: intentA,
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        page.items.map((p) => p.id),
        [pid(1), pid(3), pid(5)]
      );

      const afterFirst = await repo.fetchSentPaymentsPage({
        walletAddressId: senderWalletAddressId,
        paymentIntentId: intentA,
        cursor: pid(1),
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        afterFirst.items.map((p) => p.id),
        [pid(3), pid(5)]
      );

      const justIntent = await repo.fetchSentPaymentsPage({
        paymentIntentId: intentB,
        limit: 10,
        backwards: false
      });
      assert.deepEqual(
        justIntent.items.map((p) => p.id),
        [pid(2), pid(4)]
      );
    });

    test('unknown cursor throws InvalidCursorError', async () => {
      await assert.rejects(
        repo.fetchSentPaymentsPage({
          walletAddressId: senderWalletAddressId,
          cursor: randomUUID(),
          limit: 2,
          backwards: false
        }),
        InvalidCursorError
      );
    });
  });
});
