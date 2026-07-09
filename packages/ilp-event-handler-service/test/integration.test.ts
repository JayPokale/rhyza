'use strict';

import assert from 'node:assert';
import { describe, test } from 'node:test';
import {
  CommandTopics,
  ConsoleLogger,
  DomainEventTopics,
  IMessage,
  IMessageConsumer,
  IMessageProducer,
  IMessageProducerAcks
} from 'common-types-lib';
import {
  IlpPeerAggregate,
  IPeer,
  RemoteQuoteRequestReceivedEvent
} from 'ilp-domain-lib';
import {
  InMemoryPeerRepository,
  KafkaPeeringClient
} from 'ilp-implementations-lib';
import { IlpConnector } from 'ilp-connector-service/dist/src/connector.js';
import type {
  IConnectorTransport,
  WireFulfillOutbound,
  WireInboundPrepareHandler,
  WirePrepare,
  WireRejectOutbound
} from 'ilp-connector-service/dist/src/transport.js';
import { IlpCommandHandler } from 'ilp-command-handler-service/dist/cmd-handler.js';
import { IlpEventHandler } from '../src/event-handler';
import { FixedRateQuoteCalculator, PaymentsBcQuoteFixture } from './helpers';
import { IQuoteCalculator } from './helpers/quote-calculator';

type BatchCb = (messages: IMessage[]) => Promise<void>;

class InMemoryBus {
  private readonly _subscriptions: { topics: Set<string>; cb?: BatchCb }[] = [];
  readonly published: IMessage[] = [];

  producer(): IMessageProducer {
    const route = (message: IMessage | IMessage[]) =>
      this._route(Array.isArray(message) ? message : [message]);
    return {
      async send(message): Promise<IMessageProducerAcks[]> {
        await route(message);
        return [];
      },
      async sendWithoutAcks(message): Promise<void> {
        await route(message);
      },
      async connect(): Promise<void> {},
      async disconnect(): Promise<void> {},
      async destroy(): Promise<void> {}
    };
  }

  consumer(): IMessageConsumer {
    const subscription: { topics: Set<string>; cb?: BatchCb } = {
      topics: new Set()
    };
    this._subscriptions.push(subscription);
    return {
      setTopics: (topics: string[]) => {
        subscription.topics = new Set(topics);
      },
      setBatchCallbackFn: (cb: BatchCb) => {
        subscription.cb = cb;
      },
      setCallbackFn: () => {},
      setFilteringFn: () => {},
      setBatchSize: () => {},
      connect: async () => {},
      disconnect: async () => {},
      start: async () => {},
      startAndWaitForRebalance: async () => {},
      stop: async () => {},
      destroy: async () => {}
    };
  }

  private async _route(messages: IMessage[]): Promise<void> {
    this.published.push(...messages);
    for (const subscription of this._subscriptions) {
      const forSubscription = messages.filter((m) =>
        subscription.topics.has(m.msgTopic)
      );
      if (forSubscription.length > 0 && subscription.cb) {
        await subscription.cb(forSubscription);
      }
    }
  }
}

// Transport double that lets the test inject an inbound prepare (a peer
// initiating a quoting probe) and captures the reject the connector sends back.
class ReceivingTransport implements IConnectorTransport {
  private _onInboundPrepare?: WireInboundPrepareHandler;
  readonly sentResponses: Array<WireFulfillOutbound | WireRejectOutbound> = [];

  async sendPrepare(): Promise<void> {}
  async sendFulfill(fulfill: WireFulfillOutbound): Promise<void> {
    this.sentResponses.push(fulfill);
  }
  async sendReject(reject: WireRejectOutbound): Promise<void> {
    this.sentResponses.push(reject);
  }
  onResponse(): void {}
  onInboundPrepare(handler: WireInboundPrepareHandler): void {
    this._onInboundPrepare = handler;
  }
  async simulateInboundPrepare(prepare: WirePrepare): Promise<void> {
    await this._onInboundPrepare?.(prepare);
  }
}

const PEER: IPeer = {
  peerId: 'peer-1',
  http: { outgoing: { endpoint: 'https://peer.example/ilp', authToken: 't' } },
  isActive: true
};

const probe = (overrides: Partial<WirePrepare> = {}): WirePrepare => ({
  peerId: 'peer-1',
  packetId: 'packet-in-1',
  destinationIlpAddress: 'g.us.alice',
  amount: '100',
  expiresAt: new Date(Date.now() + 30_000).toISOString(),
  executionCondition: Buffer.alloc(32).toString('base64'),
  ...overrides
});

// Wires the connector, ILP command handler, ILP event handler and a test
// Payments BC fixture together over the bus, mirroring the deployed services.
async function wireSystem(calculator?: IQuoteCalculator) {
  const bus = new InMemoryBus();
  const logger = new ConsoleLogger();
  const producer = bus.producer();

  const transport = new ReceivingTransport();
  const connector = new IlpConnector(producer, transport, logger);
  connector.init();
  const connectorConsumer = bus.consumer();
  connectorConsumer.setTopics([CommandTopics.IlpConnectorCommands]);
  connectorConsumer.setBatchCallbackFn((messages) =>
    connector.handleConnectorCommands(messages)
  );
  await connectorConsumer.connect();
  await connectorConsumer.startAndWaitForRebalance();

  const repo = new InMemoryPeerRepository([PEER]);
  const aggregate = new IlpPeerAggregate(
    repo,
    new KafkaPeeringClient(producer, logger)
  );
  const cmdHandler = new IlpCommandHandler(
    bus.consumer(),
    producer,
    aggregate,
    logger
  );
  await cmdHandler.start();

  const eventHandler = new IlpEventHandler(bus.consumer(), producer, logger);
  await eventHandler.start();

  const paymentsBcFixture = new PaymentsBcQuoteFixture(
    bus.consumer(),
    producer,
    logger,
    calculator
  );
  await paymentsBcFixture.start();

  return { bus, transport };
}

const lastReject = (transport: ReceivingTransport): WireRejectOutbound => {
  assert.equal(
    transport.sentResponses.length,
    1,
    'expected exactly one reject'
  );
  return transport.sentResponses[0] as WireRejectOutbound;
};

const requestReceivedEvents = (bus: InMemoryBus) =>
  bus.published.filter(
    (m) =>
      m.msgTopic === DomainEventTopics.IlpEvents &&
      m.msgName === RemoteQuoteRequestReceivedEvent.name
  );

describe('ILP receiving quote flow over Kafka topics', () => {
  test('inbound probe -> request received -> Payments BC quote -> reject', async () => {
    const { bus, transport } = await wireSystem(
      new FixedRateQuoteCalculator(95n, 100n)
    );

    await transport.simulateInboundPrepare(probe());

    // The aggregate decoded the probe and published the request received event.
    assert.equal(requestReceivedEvents(bus).length, 1);

    // The probe was answered on the wire with a reject carrying the calculated
    // destination amount (F99 = quote response).
    const reject = lastReject(transport);
    assert.equal(reject.peerId, 'peer-1');
    assert.equal(reject.packetId, 'packet-in-1');
    assert.equal(reject.rejectCode, 'F99');
    assert.ok(reject.data, 'expected the destination amount on the reject');
    const decoded = JSON.parse(
      Buffer.from(reject.data as string, 'base64').toString()
    );
    assert.equal(decoded.destinationAmount, '95');
  });

  test('an unresolved peer is answered with a generic reject and no event', async () => {
    const { bus, transport } = await wireSystem();

    await transport.simulateInboundPrepare(probe({ peerId: 'peer-unknown' }));

    assert.equal(requestReceivedEvents(bus).length, 0);
    const reject = lastReject(transport);
    assert.equal(reject.rejectCode, 'T00');
    assert.equal(reject.data, undefined);
  });

  test('an undecodable probe is answered with a generic reject', async () => {
    const { bus, transport } = await wireSystem();

    await transport.simulateInboundPrepare(probe({ amount: '' }));

    assert.equal(requestReceivedEvents(bus).length, 0);
    const reject = lastReject(transport);
    assert.equal(reject.rejectCode, 'T00');
  });
});
