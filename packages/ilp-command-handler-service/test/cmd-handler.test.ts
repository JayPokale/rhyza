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
  ActivatePeerCmd,
  CreatePeerCmd,
  DeactivatePeerCmd,
  DispatchPreparePacketCmd,
  DispatchRejectPacketCmd,
  ExpirePacketCmd,
  IlpPeerAggregate,
  ILPPeerCreatedEvent,
  ILPPeerCreationFailedEvent,
  ILPPeerUpdatedEvent,
  ILPPeerUpdateFailedEvent,
  IPeer,
  ProcessPreparePacketCmd,
  ProcessRejectPacketCmd,
  ILPQuoteReceivedEvent,
  ILPQuoteFailedEvent,
  StartRemoteQuoteCmd,
  UpdatePeerCmd
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

// Captures the batch callback the handler registers and lets the test push
// batches through it, standing in for the Kafka consumer.
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

const startQuote = () =>
  new StartRemoteQuoteCmd(
    {
      peerId: 'peer-1',
      paymentIntentId: 'intent-1',
      quoteId: 'quote-1',
      destinationIlpAddress: 'g.peer.bob',
      sourceAmount: '100',
      sourceAssetCode: 'USD',
      sourceAssetScale: 2
    },
    'req-1'
  );

async function startedHandler() {
  const producer = new MockProducer();
  const consumer = new MockConsumer();
  const repo = new InMemoryPeerRepository([PEER]);
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

const dispatchedPacketId = (producer: MockProducer): string => {
  const dispatch = producer.sent.find(
    (m) => m.msgName === DispatchPreparePacketCmd.name
  ) as DispatchPreparePacketCmd | undefined;
  assert.ok(dispatch, 'expected a DispatchPreparePacketCmd to be produced');
  return dispatch.payload.packetId;
};

describe('IlpCommandHandler — peer creation/update', () => {
  test('CreatePeerCmd for a new peer yields ILPPeerCreatedEvent and the peer becomes resolvable', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new CreatePeerCmd(
        {
          peerId: 'peer-new',
          http: {
            outgoing: {
              endpoint: 'https://new-peer.example/ilp',
              authToken: 't'
            }
          },
          isActive: true
        },
        'req-create-1'
      )
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPPeerCreatedEvent.name
    ) as ILPPeerCreatedEvent;
    assert.ok(event, 'expected a ILPPeerCreatedEvent');
    assert.equal(event.payload.peerId, 'peer-new');
    assert.equal(event.requestId, 'req-create-1');

    // The newly created peer is now resolvable by a subsequent command.
    await consumer.deliver([
      new StartRemoteQuoteCmd(
        {
          peerId: 'peer-new',
          paymentIntentId: 'intent-2',
          quoteId: 'quote-2',
          destinationIlpAddress: 'g.peer.bob',
          sourceAmount: '50',
          sourceAssetCode: 'USD',
          sourceAssetScale: 2
        },
        'req-2'
      )
    ]);
    const dispatch = producer.sent.find(
      (m) =>
        m.msgName === DispatchPreparePacketCmd.name &&
        (m as DispatchPreparePacketCmd).msgKey === 'peer-new'
    );
    assert.ok(dispatch, 'expected the new peer to be resolvable');
  });

  test('CreatePeerCmd for an existing peer yields ILPPeerCreationFailedEvent', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new CreatePeerCmd(
        {
          peerId: 'peer-1',
          http: {
            outgoing: { endpoint: 'https://peer.example/ilp', authToken: 't' }
          }
        },
        'req-create-dup'
      )
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPPeerCreationFailedEvent.name
    ) as ILPPeerCreationFailedEvent;
    assert.ok(event, 'expected a ILPPeerCreationFailedEvent');
    assert.equal(event.payload.errorName, 'DuplicatePeer');
    assert.equal(event.isErrorEvent, true);
    assert.equal(event.requestId, 'req-create-dup');
  });

  test('UpdatePeerCmd for an existing peer yields ILPPeerUpdatedEvent', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new UpdatePeerCmd(
        {
          peerId: 'peer-1',
          http: {
            outgoing: {
              endpoint: 'https://peer.example/ilp-v2',
              authToken: 't2'
            }
          },
          isActive: false
        },
        'req-update-1'
      )
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPPeerUpdatedEvent.name
    ) as ILPPeerUpdatedEvent;
    assert.ok(event, 'expected a ILPPeerUpdatedEvent');
    assert.equal(
      event.payload.http.outgoing.endpoint,
      'https://peer.example/ilp-v2'
    );
    assert.equal(event.payload.isActive, false);
    assert.equal(event.requestId, 'req-update-1');
  });

  test('UpdatePeerCmd for an unknown peer yields ILPPeerUpdateFailedEvent', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new UpdatePeerCmd(
        {
          peerId: 'peer-does-not-exist',
          http: {
            outgoing: { endpoint: 'https://peer.example/ilp', authToken: 't' }
          }
        },
        'req-update-unknown'
      )
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPPeerUpdateFailedEvent.name
    ) as ILPPeerUpdateFailedEvent;
    assert.ok(event, 'expected a ILPPeerUpdateFailedEvent');
    assert.equal(event.payload.errorName, 'UnknownPeer');
    assert.equal(event.isErrorEvent, true);
    assert.equal(event.requestId, 'req-update-unknown');
  });
});

describe('IlpCommandHandler — peer activation mirror', () => {
  test('DeactivatePeerCmd for an existing peer flips isActive to false', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new DeactivatePeerCmd({ peerId: 'peer-1' }, 'req-deactivate-1')
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPPeerUpdatedEvent.name
    ) as ILPPeerUpdatedEvent;
    assert.ok(event, 'expected a ILPPeerUpdatedEvent');
    assert.equal(event.payload.peerId, 'peer-1');
    assert.equal(event.payload.isActive, false);
    assert.equal(event.requestId, 'req-deactivate-1');

    // A deactivated peer's inbound prepares are rejected generically instead
    // of being decoded/routed
    await consumer.deliver([
      new ProcessPreparePacketCmd({
        peerId: 'peer-1',
        packetId: 'packet-1',
        destinationIlpAddress: 'g.us.alice',
        amount: '100',
        expiresAt: new Date(Date.now() + 30_000).toISOString(),
        executionCondition: Buffer.alloc(32).toString('base64')
      })
    ]);
    const dispatch = producer.sent.find(
      (m) => m.msgName === DispatchRejectPacketCmd.name
    ) as DispatchRejectPacketCmd | undefined;
    assert.ok(dispatch, 'expected the inbound prepare to be rejected');
    assert.equal(dispatch.payload.rejectCode, 'T00');
  });

  test('ActivatePeerCmd for an existing peer flips isActive to true', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new DeactivatePeerCmd({ peerId: 'peer-1' }, 'req-deactivate-2')
    ]);
    await consumer.deliver([
      new ActivatePeerCmd({ peerId: 'peer-1' }, 'req-activate-1')
    ]);

    const events = producer.sent.filter(
      (m) => m.msgName === ILPPeerUpdatedEvent.name
    ) as ILPPeerUpdatedEvent[];
    const activated = events.at(-1);
    assert.ok(activated, 'expected a ILPPeerUpdatedEvent');
    assert.equal(activated.payload.isActive, true);
    assert.equal(activated.requestId, 'req-activate-1');
  });

  test('DeactivatePeerCmd for an unknown peer yields ILPPeerUpdateFailedEvent', async () => {
    const { producer, consumer } = await startedHandler();

    await consumer.deliver([
      new DeactivatePeerCmd(
        { peerId: 'peer-does-not-exist' },
        'req-deactivate-unknown'
      )
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPPeerUpdateFailedEvent.name
    ) as ILPPeerUpdateFailedEvent;
    assert.ok(event, 'expected a ILPPeerUpdateFailedEvent');
    assert.equal(event.payload.errorName, 'UnknownPeer');
    assert.equal(event.isErrorEvent, true);
    assert.equal(event.requestId, 'req-deactivate-unknown');
  });
});

describe('IlpCommandHandler — remote quote sending', () => {
  test('starting a remote quote dispatches a probe to the connector', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([startQuote()]);

    const dispatch = producer.sent.find(
      (m) => m.msgName === DispatchPreparePacketCmd.name
    ) as DispatchPreparePacketCmd;
    assert.ok(dispatch);
    assert.equal(dispatch.msgTopic, 'ilp-connector-commands');
    assert.equal(dispatch.msgKey, 'peer-1');
    assert.equal(dispatch.payload.paymentIntentId, 'intent-1');
    assert.equal(dispatch.payload.amount, '100');
    assert.ok(dispatch.payload.executionCondition.length > 0);
    assert.ok(dispatch.payload.expiresAt);
  });

  test('a peer reject carrying amounts yields a ILPQuoteReceivedEvent', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([startQuote()]);
    const packetId = dispatchedPacketId(producer);

    await consumer.deliver([
      new ProcessRejectPacketCmd({
        peerId: 'peer-1',
        paymentIntentId: 'intent-1',
        packetId,
        rejectCode: 'F99',
        rejectMessage: 'quote response',
        rejectedAt: new Date().toISOString(),
        destinationAmount: '95'
      })
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPQuoteReceivedEvent.name
    ) as ILPQuoteReceivedEvent;
    assert.ok(event, 'expected a ILPQuoteReceivedEvent');
    assert.equal(event.msgTopic, 'ilp-domain-events');
    assert.equal(event.payload.quoteId, 'quote-1');
    assert.equal(event.payload.destinationAmount, '95');
    assert.equal(event.requestId, 'req-1');
  });

  test('a peer reject without amounts yields a ILPQuoteFailedEvent', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([startQuote()]);
    const packetId = dispatchedPacketId(producer);

    await consumer.deliver([
      new ProcessRejectPacketCmd({
        peerId: 'peer-1',
        paymentIntentId: 'intent-1',
        packetId,
        rejectCode: 'F02',
        rejectMessage: 'unreachable',
        rejectedAt: new Date().toISOString()
      })
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPQuoteFailedEvent.name
    ) as ILPQuoteFailedEvent;
    assert.ok(event, 'expected a ILPQuoteFailedEvent');
    assert.equal(event.payload.rejectCode, 'F02');
    assert.equal(event.isErrorEvent, true);
    assert.equal(event.requestId, 'req-1');
  });

  test('an expiry with no response yields a ILPQuoteFailedEvent (timeout)', async () => {
    const { producer, consumer } = await startedHandler();
    await consumer.deliver([startQuote()]);
    const packetId = dispatchedPacketId(producer);

    await consumer.deliver([
      new ExpirePacketCmd({
        peerId: 'peer-1',
        packetId,
        expiredAt: new Date().toISOString()
      })
    ]);

    const event = producer.sent.find(
      (m) => m.msgName === ILPQuoteFailedEvent.name
    ) as ILPQuoteFailedEvent;
    assert.ok(event, 'expected a ILPQuoteFailedEvent');
    assert.equal(event.payload.expired, true);
    assert.equal(event.requestId, 'req-1');
  });
});

describe('KafkaPeeringClient', () => {
  test('maps a QUOTE dispatch to a DispatchPreparePacketCmd on the connector topic', async () => {
    const producer = new MockProducer();
    const client = new KafkaPeeringClient(producer, new ConsoleLogger());

    await client.dispatch({
      type: 'QUOTE',
      peerId: 'peer-9',
      packetId: 'pk-9',
      paymentIntentId: 'intent-9',
      quoteId: 'q-9',
      destinationIlpAddress: 'g.peer.bob',
      sourceAmount: '250',
      sourceAssetCode: 'USD',
      sourceAssetScale: 2,
      expiresAt: new Date().toISOString()
    });

    assert.equal(producer.sent.length, 1);
    const cmd = producer.sent[0] as DispatchPreparePacketCmd;
    assert.equal(cmd.msgName, DispatchPreparePacketCmd.name);
    assert.equal(cmd.msgTopic, 'ilp-connector-commands');
    assert.equal(cmd.msgKey, 'peer-9');
    assert.equal(cmd.payload.amount, '250');
    assert.equal(cmd.payload.packetId, 'pk-9');
    assert.equal(
      Buffer.from(cmd.payload.executionCondition, 'base64').length,
      32
    );
  });
});
