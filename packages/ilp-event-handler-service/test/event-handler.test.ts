'use strict';

import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  ConsoleLogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer,
  IMessageProducerAcks
} from 'common-types-lib';
import {
  ILPQuoteRequestReceivedEvent,
  RespondToRemoteQuoteCmd
} from 'ilp-domain-lib';
import { IlpEventHandler } from '../src/event-handler';
import {
  PAYMENTS_REMOTE_QUOTE_CALCULATED_EVENT,
  PAYMENTS_REMOTE_QUOTE_CALCULATION_FAILED_EVENT
} from '../src/payments-contract';
import {
  FixedRateQuoteCalculator,
  PaymentsBcQuoteFixture,
  RemoteQuoteCalculatedEvent,
  RemoteQuoteCalculationFailedEvent
} from './helpers';

class MockProducer implements IMessageProducer {
  readonly sent: IMessage[] = [];
  async send(message: IMessage | IMessage[]): Promise<IMessageProducerAcks[]> {
    this.sent.push(...(Array.isArray(message) ? message : [message]));
    return [];
  }
  async sendWithoutAcks(message: IMessage | IMessage[]): Promise<void> {
    await this.send(message);
  }
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async destroy(): Promise<void> {}
}

class MockConsumer implements IMessageConsumer {
  private _batchCb?: (messages: IMessage[]) => Promise<void>;
  setCallbackFn(): void {}
  setBatchCallbackFn(cb: (messages: IMessage[]) => Promise<void>): void {
    this._batchCb = cb;
  }
  setFilteringFn(): void {}
  setTopics(): void {}
  setBatchSize(): void {}
  async destroy(): Promise<void> {}
  async connect(): Promise<void> {}
  async disconnect(): Promise<void> {}
  async start(): Promise<void> {}
  async startAndWaitForRebalance(): Promise<void> {}
  async stop(): Promise<void> {}
  async deliver(messages: IMessage[]): Promise<void> {
    await this._batchCb?.(messages);
  }
}

const request = () =>
  new ILPQuoteRequestReceivedEvent({
    peerId: 'peer-1',
    packetId: 'packet-in-1',
    destinationIlpAddress: 'g.us.alice',
    incomingAmount: '100',
    expiresAt: new Date().toISOString()
  });

describe('IlpEventHandler', () => {
  test('maps a RemoteQuoteCalculatedEvent to a RespondToRemoteQuoteCmd', async () => {
    const producer = new MockProducer();
    const consumer = new MockConsumer();
    const handler = new IlpEventHandler(
      consumer,
      producer,
      new ConsoleLogger()
    );
    await handler.start();

    await consumer.deliver([
      new RemoteQuoteCalculatedEvent({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        destinationAmount: '95'
      })
    ]);

    assert.equal(producer.sent.length, 1);
    const cmd = producer.sent[0] as RespondToRemoteQuoteCmd;
    assert.equal(cmd.msgName, RespondToRemoteQuoteCmd.name);
    assert.equal(cmd.msgTopic, 'ilp-commands');
    assert.equal(cmd.msgKey, 'packet-in-1');
    assert.equal(cmd.payload.destinationAmount, '95');
  });

  test('maps a calculation-failed event to a command with no amount', async () => {
    const producer = new MockProducer();
    const consumer = new MockConsumer();
    const handler = new IlpEventHandler(
      consumer,
      producer,
      new ConsoleLogger()
    );
    await handler.start();

    await consumer.deliver([
      new RemoteQuoteCalculationFailedEvent({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        reason: 'no rate'
      })
    ]);

    assert.equal(producer.sent.length, 1);
    const cmd = producer.sent[0] as RespondToRemoteQuoteCmd;
    assert.equal(cmd.payload.destinationAmount, undefined);
  });

  test('ignores unrelated Payments BC events', async () => {
    const producer = new MockProducer();
    const consumer = new MockConsumer();
    const handler = new IlpEventHandler(
      consumer,
      producer,
      new ConsoleLogger()
    );
    await handler.start();

    await consumer.deliver([
      { msgName: 'SomeOtherPaymentEvent', payload: {} } as unknown as IMessage
    ]);

    assert.equal(producer.sent.length, 0);
  });
});

describe('PaymentsBcQuoteFixture', () => {
  test('answers a request with a calculated event (1:1 default rate)', async () => {
    const producer = new MockProducer();
    const consumer = new MockConsumer();
    const fixture = new PaymentsBcQuoteFixture(
      consumer,
      producer,
      new ConsoleLogger()
    );
    await fixture.start();

    await consumer.deliver([request()]);

    assert.equal(producer.sent.length, 1);
    const event = producer.sent[0] as RemoteQuoteCalculatedEvent;
    assert.equal(event.msgName, PAYMENTS_REMOTE_QUOTE_CALCULATED_EVENT);
    assert.equal(event.msgTopic, 'payment-domain-events');
    assert.equal(event.payload.packetId, 'packet-in-1');
    assert.equal(event.payload.destinationAmount, '100');
  });

  test('applies the configured FX rate', async () => {
    const producer = new MockProducer();
    const consumer = new MockConsumer();
    const fixture = new PaymentsBcQuoteFixture(
      consumer,
      producer,
      new ConsoleLogger(),
      new FixedRateQuoteCalculator(95n, 100n)
    );
    await fixture.start();

    await consumer.deliver([request()]);

    const event = producer.sent[0] as RemoteQuoteCalculatedEvent;
    assert.equal(event.payload.destinationAmount, '95');
  });

  test('emits a calculation-failed event for an invalid amount', async () => {
    const producer = new MockProducer();
    const consumer = new MockConsumer();
    const fixture = new PaymentsBcQuoteFixture(
      consumer,
      producer,
      new ConsoleLogger()
    );
    await fixture.start();

    await consumer.deliver([
      new ILPQuoteRequestReceivedEvent({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        destinationIlpAddress: 'g.us.alice',
        incomingAmount: 'not-a-number',
        expiresAt: new Date().toISOString()
      })
    ]);

    assert.equal(producer.sent.length, 1);
    assert.equal(
      producer.sent[0].msgName,
      PAYMENTS_REMOTE_QUOTE_CALCULATION_FAILED_EVENT
    );
  });
});
