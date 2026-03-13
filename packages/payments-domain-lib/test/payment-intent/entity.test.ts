import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentIntent } from '../../src/payment-intent/entity';
import {
  InvalidPaymentIntentExpiryError,
  InvalidQuoteIdError
} from '../../src/payment-intent/errors';
import { PaymentIntentDestination } from '../../src/payment-intent/interfaces';

describe('PaymentIntent Entity', () => {
  describe('create', () => {
    it('creates successfully', (context) => {
      const now = Date.now();
      context.mock.timers.enable({ apis: ['Date'], now });

      const id = crypto.randomUUID();
      const paymentIntent = PaymentIntent.create(
        id,
        crypto.randomUUID(),
        'receiver',
        PaymentIntentDestination.LOCAL,
        'USD',
        2,
        null
      );
      assert.equal(paymentIntent.id, id);
      assert.equal(paymentIntent.state, 'CREATED');
      assert.equal(
        paymentIntent.expiresAt.getTime(),
        new Date(now + 1000 * 60 * 60 * 24 * 30).getTime() // Default expiry is 30 days
      );
    });

    it('throws InvalidPaymentIntentExpiryError if expiry is in the past', () => {
      const pastDate = new Date(Date.now() - 60000).toISOString();
      assert.throws(
        () => {
          PaymentIntent.create(
            crypto.randomUUID(),
            crypto.randomUUID(),
            'receiver',
            PaymentIntentDestination.LOCAL,
            'USD',
            2,
            pastDate
          );
        },
        (err: Error) => {
          assert(err instanceof InvalidPaymentIntentExpiryError);
          assert.match(err.message, /future/);
          return true;
        }
      );
    });

    it('throws InvalidPaymentIntentExpiryError if expiry is > 30 days', () => {
      const farFuture = new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 31
      ).toISOString(); // 31 days
      assert.throws(
        () => {
          PaymentIntent.create(
            crypto.randomUUID(),
            crypto.randomUUID(),
            'receiver',
            PaymentIntentDestination.LOCAL,
            'USD',
            2,
            farFuture
          );
        },
        (err: Error) => {
          assert(err instanceof InvalidPaymentIntentExpiryError);
          assert.match(err.message, /30 days/);
          return true;
        }
      );
    });
  });

  describe('isExpired', () => {
    it('returns false if current time is before expiresAt', () => {
      const paymentIntent = PaymentIntent.create(
        crypto.randomUUID(),
        crypto.randomUUID(),
        'receiver',
        PaymentIntentDestination.LOCAL,
        'USD',
        2,
        new Date(Date.now() + 1000 * 60).toISOString()
      );
      assert.equal(paymentIntent.isExpired, false);
    });

    it('returns true if current time is after expiresAt', () => {
      const paymentIntent = PaymentIntent.fromObject({
        id: crypto.randomUUID(),
        receiverWalletAddressId: crypto.randomUUID(),
        receiverWalletAddress: 'receiver',
        destination: PaymentIntentDestination.LOCAL,
        assetCode: 'USD',
        assetScale: 2,
        incomingAmount: null,
        receivedAmount: 0n,
        state: 'CREATED',
        expiresAt: new Date(Date.now() - 1000),
        quotes: []
      });

      assert.equal(paymentIntent.isExpired, true);
    });
  });

  describe('addCompletedQuote', () => {
    it('adds a quote', (context) => {
      const now = Date.now();
      context.mock.timers.enable({ apis: ['Date'], now });

      const paymentIntent = PaymentIntent.create(
        crypto.randomUUID(),
        crypto.randomUUID(),
        'receiver',
        PaymentIntentDestination.LOCAL,
        'USD',
        2,
        null
      );

      const quoteId = crypto.randomUUID();
      const senderWalletAddressId = crypto.randomUUID();

      paymentIntent.addCompletedQuote({
        id: quoteId,
        receiveAmount: 100n,
        debitAmount: 200n,
        exchangeRate: 0.5,
        senderWalletAddress: 'sender',
        senderWalletAddressId
      });

      assert.equal(paymentIntent.quotes.length, 1);
      const quote = paymentIntent.quotes[0];
      assert.equal(quote.id, quoteId);
      assert.equal(quote.state, 'COMPLETED');
      assert.equal(quote.receiveAmount, 100n);
      assert.equal(quote.debitAmount, 200n);
      assert.equal(quote.senderWalletAddress, 'sender');
      assert.equal(quote.senderWalletAddressId, senderWalletAddressId);

      const expectedExpiry = new Date(now + 1000 * 60 * 10); // Default quote expiry is 10 mins
      assert.equal(quote.expiresAt.getTime(), expectedExpiry.getTime());
      assert.ok(quote.expiresAt.getTime() < paymentIntent.expiresAt.getTime());
    });

    it('caps quote expiry at payment intent expiry if intent expires sooner', () => {
      const paymentIntentExpiry = new Date(
        Date.now() + 1000 * 60
      ).toISOString();
      const paymentIntent = PaymentIntent.create(
        crypto.randomUUID(),
        crypto.randomUUID(),
        'receiver',
        PaymentIntentDestination.LOCAL,
        'USD',
        2,
        paymentIntentExpiry
      );

      paymentIntent.addCompletedQuote({
        id: crypto.randomUUID(),
        receiveAmount: 100n,
        debitAmount: 200n,
        exchangeRate: 0.5,
        senderWalletAddress: 'sender',
        senderWalletAddressId: crypto.randomUUID()
      });

      assert.equal(
        paymentIntent.quotes[0].expiresAt.toISOString(),
        paymentIntentExpiry
      );
    });

    it('throws InvalidQuoteIdError on duplicate quote id', () => {
      const paymentIntent = PaymentIntent.create(
        crypto.randomUUID(),
        crypto.randomUUID(),
        'receiver',
        PaymentIntentDestination.LOCAL,
        'USD',
        2,
        new Date(Date.now() + 60_000 * 10).toISOString()
      );

      const quoteId = crypto.randomUUID();
      const quoteArgs = {
        id: quoteId,
        receiveAmount: 100n,
        debitAmount: 200n,
        exchangeRate: 0.5,
        senderWalletAddress: 'sender',
        senderWalletAddressId: crypto.randomUUID()
      };

      paymentIntent.addCompletedQuote(quoteArgs);

      assert.throws(
        () => {
          paymentIntent.addCompletedQuote(quoteArgs);
        },
        (err: Error) => {
          assert(err instanceof InvalidQuoteIdError);
          assert.match(err.message, /Duplicate quote id/);
          return true;
        }
      );
    });
  });
});
