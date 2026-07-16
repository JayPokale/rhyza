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
  DispatchRejectPacketCmd,
  IlpPeerAggregate,
  IPeer,
  ProcessPreparePacketCmd,
  ILPPaymentFailedEvent,
  ILPQuoteRequestReceivedEvent,
  RespondToRemoteQuoteCmd
} from 'ilp-domain-lib';
import {
  InMemoryPeerRepository,
  KafkaPeeringClient
} from 'ilp-implementations-lib';
import { IlpCommandHandler } from '../src/cmd-handler';

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

const PEER: IPeer = {
  peerId: 'peer-1',
  http: { outgoing: { endpoint: 'https://peer.example/ilp', authToken: 't' } },
  isActive: true
};

const TEST_REPLY_HANDLE = 'reply-handle-inbound-1';

const inboundProbe = (overrides: Record<string, unknown> = {}) =>
  new ProcessPreparePacketCmd({
    peerId: 'peer-1',
    packetId: 'packet-in-1',
    destinationIlpAddress: 'g.us.alice',
    amount: '100',
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
    replyHandle: TEST_REPLY_HANDLE,
    executionCondition: Buffer.alloc(32).toString('base64'),
    ...overrides
  });

async function startedHandler(seedPeers: IPeer[] = [PEER]) {
  const producer = new MockProducer();
  const consumer = new MockConsumer();
  const repo = new InMemoryPeerRepository(seedPeers);
  const peeringClient = new KafkaPeeringClient(producer, new ConsoleLogger());
  const aggregate = new IlpPeerAggregate(repo, peeringClient);
  const handler = new IlpCommandHandler(
    consumer,
    producer,
    aggregate,
    new ConsoleLogger()
  );
  await handler.start();
  return { producer, consumer };
}

const rejectFor = (producer: MockProducer): DispatchRejectPacketCmd =>
  producer.sent.find(
    (m) => m.msgName === DispatchRejectPacketCmd.name
  ) as DispatchRejectPacketCmd;

describe('IlpCommandHandler — remote quote receiving', () => {
  test('an inbound probe publishes a ILPQuoteRequestReceivedEvent', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([inboundProbe()]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
    ) as ILPQuoteRequestReceivedEvent;
    assert.ok(event, 'expected a ILPQuoteRequestReceivedEvent');
    assert.equal(event.msgTopic, 'ilp-domain-events');
    assert.equal(event.payload.peerId, 'peer-1');
    assert.equal(event.payload.packetId, 'packet-in-1');
    assert.equal(event.payload.incomingAmount, '100');
    assert.equal(event.payload.destinationIlpAddress, 'g.us.alice');

    // The receiving path must not emit a reject for a good probe.
    assert.equal(
      producer.sent.filter((m) => m.msgName === DispatchRejectPacketCmd.name)
        .length,
      0
    );
  });

  test('a calculated quote produces a reject carrying the amount', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([inboundProbe()]);
    await consumer.deliver([
      new RespondToRemoteQuoteCmd({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        destinationAmount: '95'
      })
    ]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a DispatchRejectPacketCmd');
    assert.equal(reject.msgTopic, 'ilp-connector-commands');
    assert.equal(reject.msgKey, 'peer-1');
    assert.equal(reject.payload.peerId, 'peer-1');
    assert.equal(reject.payload.packetId, 'packet-in-1');
    assert.equal(reject.payload.replyHandle, TEST_REPLY_HANDLE);
    assert.equal(reject.payload.rejectCode, 'F99');
    assert.ok(reject.payload.data, 'expected the destination amount in data');
    const decoded = JSON.parse(
      Buffer.from(reject.payload.data as string, 'base64').toString()
    );
    assert.equal(decoded.destinationAmount, '95');
  });

  test('an undecodable probe yields a generic reject and no event', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([inboundProbe({ amount: '' })]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.rejectCode, 'T00');
    assert.equal(reject.payload.data, undefined, 'must not leak detail');
    assert.equal(
      producer.sent.filter(
        (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
      ).length,
      0
    );
  });

  test('an unresolved peer yields a generic reject', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([inboundProbe({ peerId: 'peer-unknown' })]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.peerId, 'peer-unknown');
    assert.equal(reject.payload.rejectCode, 'T00');
    assert.equal(
      producer.sent.filter(
        (m) => m.msgName === ILPQuoteRequestReceivedEvent.name
      ).length,
      0
    );
  });

  test('an inactive peer yields a generic reject', async () => {
    const { producer, consumer } = await startedHandler([
      { ...PEER, isActive: false }
    ]);
    await consumer.deliver([inboundProbe()]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.rejectCode, 'T00');
  });

  test('a missing calculated quote yields a generic reject', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([inboundProbe()]);
    await consumer.deliver([
      new RespondToRemoteQuoteCmd({
        peerId: 'peer-1',
        packetId: 'packet-in-1'
      })
    ]);

    const reject = rejectFor(producer);
    assert.ok(reject, 'expected a generic reject');
    assert.equal(reject.payload.rejectCode, 'T00');
    assert.equal(reject.payload.data, undefined);
  });

  test('the receiving path never touches payment-receiving liquidity logic', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([inboundProbe()]);
    await consumer.deliver([
      new RespondToRemoteQuoteCmd({
        peerId: 'peer-1',
        packetId: 'packet-in-1',
        destinationAmount: '95'
      })
    ]);

    assert.equal(
      producer.sent.filter((m) => m.msgName === ILPPaymentFailedEvent.name)
        .length,
      0
    );
  });
});
