import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PaymentIntent } from '../../src/payment-intent/entity';
import {
  InvalidPaymentIntentExpiryError,
  InvalidQuoteAmountError,
  InvalidQuoteIdError,
  PaymentIntentInvalidState
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

  describe('addLocalQuote', () => {
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

      paymentIntent.addLocalQuote({
        id: quoteId,
        debitAmount: 200n,
        exchangeRate: 0.5,
        senderWalletAddress: {
          id: senderWalletAddressId,
          address: 'sender',
          assetCode: 'USD',
          assetScale: 2
        }
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
      assert.equal(quote.expiresAt?.getTime(), expectedExpiry.getTime());
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

      paymentIntent.addLocalQuote({
        id: crypto.randomUUID(),
        debitAmount: 200n,
        exchangeRate: 0.5,
        senderWalletAddress: {
          id: crypto.randomUUID(),
          address: 'sender',
          assetCode: 'USD',
          assetScale: 2
        }
      });

      assert.equal(
        paymentIntent.quotes[0].expiresAt?.toISOString(),
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

      const quoteArgs = {
        id: crypto.randomUUID(),
        debitAmount: 200n,
        exchangeRate: 0.5,
        senderWalletAddress: {
          id: crypto.randomUUID(),
          address: 'sender',
          assetCode: 'USD',
          assetScale: 2
        }
      };

      paymentIntent.addLocalQuote(quoteArgs);

      assert.throws(
        () => {
          paymentIntent.addLocalQuote(quoteArgs);
        },
        (err: Error) => {
          assert(err instanceof InvalidQuoteIdError);
          assert.match(err.message, /Duplicate quote id/);
          return true;
        }
      );
    });

    // TODO to for each of the invalid states
    it('fails if quote when payment intent is in invalid state', async () => {
      const paymentIntent = PaymentIntent.fromObject({
        id: crypto.randomUUID(),
        receiverWalletAddressId: crypto.randomUUID(),
        receiverWalletAddress: 'receiver',
        destination: PaymentIntentDestination.LOCAL,
        assetCode: 'USD',
        assetScale: 2,
        incomingAmount: null,
        receivedAmount: 0n,
        state: 'COMPLETED',
        expiresAt: new Date(Date.now() + 1000),
        quotes: []
      });

      assert.throws(
        () => {
          paymentIntent.addLocalQuote({
            id: crypto.randomUUID(),
            debitAmount: 200n,
            exchangeRate: 0.5,
            senderWalletAddress: {
              id: crypto.randomUUID(),
              address: 'sender',
              assetCode: 'USD',
              assetScale: 2
            }
          });
        },
        (err: Error) => {
          assert(err instanceof PaymentIntentInvalidState);
          assert.match(err.message, /invalid state/);
          return true;
        }
      );
    });

    it('fails if payment intent is expired', async () => {
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
        expiresAt: new Date(Date.now() - 1000), // in the past
        quotes: []
      });

      assert.throws(
        () => {
          paymentIntent.addLocalQuote({
            id: crypto.randomUUID(),
            debitAmount: 200n,
            exchangeRate: 0.5,
            senderWalletAddress: {
              id: crypto.randomUUID(),
              address: 'sender',
              assetCode: 'USD',
              assetScale: 2
            }
          });
        },
        (err: Error) => {
          assert(err instanceof PaymentIntentInvalidState);
          assert.match(err.message, /expired/);
          return true;
        }
      );
    });

    it('fails if no amounts provided for quote', async () => {
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
        expiresAt: new Date(Date.now() + 1000),
        quotes: []
      });

      assert.throws(
        () => {
          paymentIntent.addLocalQuote({
            id: crypto.randomUUID(),
            exchangeRate: 0.5,
            senderWalletAddress: {
              id: crypto.randomUUID(),
              address: 'sender',
              assetCode: 'USD',
              assetScale: 2
            }
          });
        },
        (err: Error) => {
          assert(err instanceof InvalidQuoteAmountError);
          return true;
        }
      );
    });

    it('successfully creates a quote with receive amount', () => {
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
      paymentIntent.addLocalQuote({
        id: quoteId,
        receiveAmount: 100n,
        exchangeRate: 0.5,
        senderWalletAddress: {
          id: crypto.randomUUID(),
          address: 'sender',
          assetCode: 'USD',
          assetScale: 2
        }
      });

      assert.equal(paymentIntent.quotes.length, 1);
      const quote = paymentIntent.quotes[0];
      assert.equal(quote.id, quoteId);
      assert.equal(quote.receiveAmount, 100n);
      assert.equal(quote.debitAmount, 200n);
    });

    it('successfully creates quote with incomingAmount from payment intent', () => {
      const paymentIntent = PaymentIntent.create(
        crypto.randomUUID(),
        crypto.randomUUID(),
        'receiver',
        PaymentIntentDestination.LOCAL,
        'USD',
        2,
        null,
        100n
      );

      const quoteId = crypto.randomUUID();
      paymentIntent.addLocalQuote({
        id: quoteId,
        exchangeRate: 0.5,
        senderWalletAddress: {
          id: crypto.randomUUID(),
          address: 'sender',
          assetCode: 'USD',
          assetScale: 2
        }
      });

      assert.equal(paymentIntent.quotes.length, 1);
      const quote = paymentIntent.quotes[0];
      assert.equal(quote.id, quoteId);
      assert.equal(quote.receiveAmount, 100n);
      assert.equal(quote.debitAmount, 200n);
    });

    [
      {
        debitAmount: 1n,
        expectedReceiveAmount: 1n,
        exchangeRate: 1,
        description: 'exchange rate = 1'
      },
      {
        debitAmount: 10n,
        expectedReceiveAmount: 14n,
        exchangeRate: 1.4,
        description: 'exchange rate > 1'
      },
      {
        debitAmount: 10n,
        expectedReceiveAmount: 6n,
        exchangeRate: 0.67,
        description: 'exchange rate < 1 (flooring)'
      }
    ].forEach((test) => {
      it(`successfully creates quote with with debitAmount and ${test.description}`, () => {
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
        paymentIntent.addLocalQuote({
          id: quoteId,
          exchangeRate: test.exchangeRate,
          debitAmount: test.debitAmount,
          senderWalletAddress: {
            id: crypto.randomUUID(),
            address: 'sender',
            assetCode: 'USD',
            assetScale: 2
          }
        });

        assert.equal(paymentIntent.quotes.length, 1);
        const quote = paymentIntent.quotes[0];
        assert.equal(quote.id, quoteId);
        assert.equal(quote.receiveAmount, test.expectedReceiveAmount);
        assert.equal(quote.debitAmount, test.debitAmount);
      });
    });

    [
      {
        receiveAmount: 1n,
        expectedDebitAmount: 1n,
        exchangeRate: 1,
        description: 'exchange rate = 1'
      },
      {
        receiveAmount: 10n,
        expectedDebitAmount: 7n,
        exchangeRate: 1.45,
        description: 'exchange rate > 1'
      },
      {
        receiveAmount: 10n,
        expectedDebitAmount: 15n,
        exchangeRate: 0.67,
        description: 'exchange rate < 1 (ceil)'
      }
    ].forEach((test) => {
      it(`successfully creates quote with with receiveAmount and ${test.description}`, () => {
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
        paymentIntent.addLocalQuote({
          id: quoteId,
          exchangeRate: test.exchangeRate,
          receiveAmount: test.receiveAmount,
          senderWalletAddress: {
            id: crypto.randomUUID(),
            address: 'sender',
            assetCode: 'USD',
            assetScale: 2
          }
        });

        assert.equal(paymentIntent.quotes.length, 1);
        const quote = paymentIntent.quotes[0];
        assert.equal(quote.id, quoteId);
        assert.equal(quote.debitAmount, test.expectedDebitAmount);
        assert.equal(quote.receiveAmount, test.receiveAmount);
      });
    });

    [
      {
        receiveAmount: 1n,
        expectedDebitAmount: 1n,
        exchangeRate: 1,
        description: 'exchange rate = 1'
      },
      {
        receiveAmount: 10n,
        expectedDebitAmount: 7n,
        exchangeRate: 1.45,
        description: 'exchange rate > 1'
      },
      {
        receiveAmount: 10n,
        expectedDebitAmount: 15n,
        exchangeRate: 0.67,
        description: 'exchange rate < 1 (ceil)'
      }
    ].forEach((test) => {
      it(`successfully creates quote with with receiveAmount and ${test.description}`, () => {
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
        paymentIntent.addLocalQuote({
          id: quoteId,
          exchangeRate: test.exchangeRate,
          receiveAmount: test.receiveAmount,
          senderWalletAddress: {
            id: crypto.randomUUID(),
            address: 'sender',
            assetCode: 'USD',
            assetScale: 2
          }
        });

        assert.equal(paymentIntent.quotes.length, 1);
        const quote = paymentIntent.quotes[0];
        assert.equal(quote.id, quoteId);
        assert.equal(quote.debitAmount, test.expectedDebitAmount);
        assert.equal(quote.receiveAmount, test.receiveAmount);
      });
    });
  });
});
