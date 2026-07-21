import {
  FinalizedRemoteQuoteUpdate,
  IPaymentIntent,
  IPaymentIntentRepository,
  PaymentIntentState,
  SentPaymentState,
  ReceivedPaymentState
} from '../../src/payment-intent/interfaces';

export class MockPaymentIntentRepo implements IPaymentIntentRepository {
  private _store: Map<string, IPaymentIntent> = new Map();

  async storeMany(payments: IPaymentIntent[]): Promise<void> {
    for (const p of payments) {
      this._store.set(p.id, p);
    }
  }

  async fetchByIds(
    ids: string[]
  ): Promise<Omit<IPaymentIntent, 'sentPayments' | 'receivedPayments'>[]> {
    return ids.flatMap((id) => {
      const p = this._store.get(id);
      if (!p) return [];
      const { sentPayments, receivedPayments, ...rest } = p;
      void sentPayments;
      void receivedPayments;
      return [rest];
    });
  }

  async fetchByIdsWithPayments(ids: string[]): Promise<IPaymentIntent[]> {
    const results: IPaymentIntent[] = [];
    for (const id of ids) {
      const p = this._store.get(id);
      if (!p) continue;
      results.push({
        ...p,
        quotes: p.quotes.map((quote) => ({ ...quote })),
        sentPayments: p.sentPayments.map((payment) => ({
          id: payment.id,
          state: payment.state,
          createdAt: payment.createdAt,
          paymentIntentId: payment.paymentIntentId,
          senderWalletAddress: payment.senderWalletAddress,
          senderWalletAddressId: payment.senderWalletAddressId,
          quoteId: payment.quoteId,
          assetCode: payment.assetCode,
          assetScale: payment.assetScale,
          debitAmount: payment.debitAmount,
          receiveAmount: payment.receiveAmount,
          sentAmount: payment.sentAmount,
          ledgerTransferId: payment.ledgerTransferId,
          failReason: payment.failReason,
          cancelledAt: payment.cancelledAt,
          cancelReason: payment.cancelReason
        })),
        receivedPayments: p.receivedPayments.map((receivedPayment) => ({
          id: receivedPayment.id,
          state: receivedPayment.state,
          createdAt: receivedPayment.createdAt,
          paymentIntentId: receivedPayment.paymentIntentId,
          packetId: receivedPayment.packetId,
          peerId: receivedPayment.peerId,
          peerAssetCode: receivedPayment.peerAssetCode,
          peerAssetScale: receivedPayment.peerAssetScale,
          sourceAmount: receivedPayment.sourceAmount,
          receiveAmount: receivedPayment.receiveAmount,
          ledgerTransferId: receivedPayment.ledgerTransferId,
          failReason: receivedPayment.failReason
        }))
      });
    }
    return results;
  }

  async fetchIdsByRemoteUrls(
    urls: string[]
  ): Promise<Array<{ id: string; remoteUrl: string }>> {
    const results: Array<{ id: string; remoteUrl: string }> = [];
    for (const p of this._store.values()) {
      if (p.remoteUrl && urls.includes(p.remoteUrl)) {
        results.push({ id: p.id, remoteUrl: p.remoteUrl });
      }
    }
    return results;
  }

  async storeQuotes(
    quoteUpdates: { quoteIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void> {
    for (const update of quoteUpdates) {
      this._store.set(update.paymentIntent.id, update.paymentIntent);
    }
  }

  async storeSentPayments(
    paymentUpdates: { paymentIds: string[]; paymentIntent: IPaymentIntent }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      this._store.set(update.paymentIntent.id, update.paymentIntent);
    }
  }

  async storeReceivedPayments(
    receivedPaymentUpdates: {
      receivedPaymentIds: string[];
      paymentIntent: IPaymentIntent;
    }[]
  ): Promise<void> {
    for (const update of receivedPaymentUpdates) {
      this._store.set(update.paymentIntent.id, update.paymentIntent);
    }
  }

  async storeAcceptedReceivedPayments(
    receivedPaymentUpdates: {
      receivedPayments: {
        id: string;
        state: ReceivedPaymentState;
        ledgerTransferId: string;
      }[];
    }[]
  ): Promise<void> {
    for (const update of receivedPaymentUpdates) {
      for (const receivedPayment of update.receivedPayments) {
        const found = this.getAll()
          .flatMap((intent) => intent.receivedPayments)
          .find((rp) => rp.id === receivedPayment.id);
        if (!found) {
          throw new Error('Could not find received payment in store');
        }
        found.state = receivedPayment.state;
        found.ledgerTransferId = receivedPayment.ledgerTransferId;
      }
    }
  }

  async storeFailedReceivedPayments(
    receivedPaymentUpdates: {
      receivedPayments: {
        id: string;
        state: ReceivedPaymentState;
        failReason?: string;
      }[];
    }[]
  ): Promise<void> {
    for (const update of receivedPaymentUpdates) {
      for (const receivedPayment of update.receivedPayments) {
        const found = this.getAll()
          .flatMap((intent) => intent.receivedPayments)
          .find((rp) => rp.id === receivedPayment.id);
        if (!found) {
          throw new Error('Could not find received payment in store');
        }
        found.state = receivedPayment.state;
        if (receivedPayment.failReason) {
          found.failReason = receivedPayment.failReason;
        }
      }
    }
  }

  async storeFulfillableReceivedPayments(
    receivedPaymentUpdates: {
      receivedPayments: { id: string; state: ReceivedPaymentState }[];
    }[]
  ): Promise<void> {
    for (const update of receivedPaymentUpdates) {
      for (const receivedPayment of update.receivedPayments) {
        const found = this.getAll()
          .flatMap((intent) => intent.receivedPayments)
          .find((rp) => rp.id === receivedPayment.id);
        if (!found) {
          throw new Error('Could not find received payment in store');
        }
        found.state = receivedPayment.state;
      }
    }
  }

  async storeFinalizedReceivedPayments(
    receivedPaymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      receivedPayments: { id: string; state: ReceivedPaymentState }[];
    }[]
  ): Promise<void> {
    for (const update of receivedPaymentUpdates) {
      const paymentIntent = this._store.get(update.paymentIntent.id);
      if (!paymentIntent) {
        throw new Error('Could not find paymentIntent in store');
      }

      paymentIntent.state = update.paymentIntent.state;
      paymentIntent.receivedAmount = update.paymentIntent.receivedAmount;

      for (const receivedPayment of update.receivedPayments) {
        const found = paymentIntent.receivedPayments.find(
          (rp) => rp.id === receivedPayment.id
        );
        if (!found) {
          throw new Error('Could not find received payment in store');
        }
        found.state = receivedPayment.state;
      }
    }
  }

  async storeCompletedLocalPayments(
    paymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      sentPayments: {
        id: string;
        state: SentPaymentState;
        sentAmount: bigint;
      }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      const paymentIntent = this._store.get(update.paymentIntent.id);
      if (!paymentIntent) {
        throw new Error('Could not find paymentIntent in store');
      }

      paymentIntent.state = update.paymentIntent.state;
      paymentIntent.receivedAmount = update.paymentIntent.receivedAmount;

      for (const payment of update.sentPayments) {
        const foundPayment = paymentIntent.sentPayments.find(
          (p) => p.id === payment.id
        );
        if (!foundPayment) {
          throw new Error('Could not find paymentIntent in store');
        }

        foundPayment.state = payment.state;
        foundPayment.sentAmount = payment.sentAmount;
      }
    }
  }

  async storeCancelledPayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        cancelledAt: Date;
        cancelReason?: string;
      }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      for (const payment of update.sentPayments) {
        const foundPayment = this.getAll()
          .flatMap((intent) => intent.sentPayments)
          .find((p) => p.id === payment.id);
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }

        foundPayment.state = payment.state;
        foundPayment.cancelledAt = payment.cancelledAt;
        if (payment.cancelReason) {
          foundPayment.cancelReason = payment.cancelReason;
        } else {
          delete foundPayment.cancelReason;
        }
      }
    }
  }

  async storeApprovedRemotePayments(
    paymentUpdates: {
      sentPayments: { id: string; state: SentPaymentState }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      for (const payment of update.sentPayments) {
        const foundPayment = this.getAll()
          .flatMap((intent) => intent.sentPayments)
          .find((p) => p.id === payment.id);
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }
        foundPayment.state = payment.state;
      }
    }
  }

  async storeSendingRemotePayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        ledgerTransferId: string;
      }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      for (const payment of update.sentPayments) {
        const foundPayment = this.getAll()
          .flatMap((intent) => intent.sentPayments)
          .find((p) => p.id === payment.id);
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }
        foundPayment.state = payment.state;
        foundPayment.ledgerTransferId = payment.ledgerTransferId;
      }
    }
  }

  async storeFailedRemotePayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        failReason?: string;
      }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      for (const payment of update.sentPayments) {
        const foundPayment = this.getAll()
          .flatMap((intent) => intent.sentPayments)
          .find((p) => p.id === payment.id);
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }
        foundPayment.state = payment.state;
        if (payment.failReason) {
          foundPayment.failReason = payment.failReason;
        }
      }
    }
  }

  async storeConfirmedRemotePayments(
    paymentUpdates: {
      sentPayments: { id: string; state: SentPaymentState }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      for (const payment of update.sentPayments) {
        const foundPayment = this.getAll()
          .flatMap((intent) => intent.sentPayments)
          .find((p) => p.id === payment.id);
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }
        foundPayment.state = payment.state;
      }
    }
  }

  async storeRejectedRemotePayments(
    paymentUpdates: {
      sentPayments: {
        id: string;
        state: SentPaymentState;
        failReason?: string;
      }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      for (const payment of update.sentPayments) {
        const foundPayment = this.getAll()
          .flatMap((intent) => intent.sentPayments)
          .find((p) => p.id === payment.id);
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }
        foundPayment.state = payment.state;
        if (payment.failReason) {
          foundPayment.failReason = payment.failReason;
        }
      }
    }
  }

  async storeCompletedRemotePayments(
    paymentUpdates: {
      paymentIntent: {
        id: string;
        receivedAmount: bigint;
        state: PaymentIntentState;
      };
      sentPayments: {
        id: string;
        state: SentPaymentState;
        sentAmount: bigint;
      }[];
    }[]
  ): Promise<void> {
    for (const update of paymentUpdates) {
      const paymentIntent = this._store.get(update.paymentIntent.id);
      if (!paymentIntent) {
        throw new Error('Could not find paymentIntent in store');
      }

      paymentIntent.state = update.paymentIntent.state;
      paymentIntent.receivedAmount = update.paymentIntent.receivedAmount;

      for (const payment of update.sentPayments) {
        const foundPayment = paymentIntent.sentPayments.find(
          (p) => p.id === payment.id
        );
        if (!foundPayment) {
          throw new Error('Could not find payment in store');
        }
        foundPayment.state = payment.state;
        foundPayment.sentAmount = payment.sentAmount;
      }
    }
  }

  async storeFinalizedRemoteQuotes(
    updates: FinalizedRemoteQuoteUpdate[]
  ): Promise<void> {
    for (const update of updates) {
      const paymentIntent = this._store.get(update.paymentIntentId);
      if (!paymentIntent) {
        throw new Error('Could not find paymentIntent in store');
      }

      const quote = paymentIntent.quotes.find((q) => q.id === update.quoteId);
      if (!quote) {
        throw new Error('Could not find quote in store');
      }

      if (update.state === 'COMPLETED') {
        Object.assign(quote, {
          state: 'COMPLETED',
          debitAmount: update.debitAmount,
          receiveAmount: update.receiveAmount,
          exchangeRate: update.exchangeRate,
          expiresAt: update.expiresAt
        });
      } else {
        Object.assign(quote, {
          state: 'FAILED',
          errorName: update.errorName,
          message: update.message
        });
      }
    }
  }

  getAll(): IPaymentIntent[] {
    return [...this._store.values()];
  }
}
