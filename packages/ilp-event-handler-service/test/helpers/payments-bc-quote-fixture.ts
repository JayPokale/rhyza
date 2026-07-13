import {
  DomainEventTopics,
  ILogger,
  IMessage,
  IMessageConsumer,
  IMessageProducer
} from 'common-types-lib';
import { ILPQuoteRequestReceivedEvent } from 'ilp-domain-lib';
import {
  RemoteQuoteCalculatedEvent,
  RemoteQuoteCalculationFailedEvent
} from './payments-bc-events';
import { FixedRateQuoteCalculator, IQuoteCalculator } from './quote-calculator';

// Test-only replacement for the Payments BC receiving-quote flow. Wires
// ILPQuoteRequestReceivedEvent -> RemoteQuoteCalculatedEvent so ILP
// integration tests can run without the real Payments BC.
export class PaymentsBcQuoteFixture {
  constructor(
    private readonly _msgConsumer: IMessageConsumer,
    private readonly _msgProducer: IMessageProducer,
    private readonly _logger: ILogger,
    private readonly _calculator: IQuoteCalculator = new FixedRateQuoteCalculator()
  ) {}

  async start(): Promise<void> {
    this._msgConsumer.setTopics([DomainEventTopics.IlpEvents]);
    this._msgConsumer.setBatchCallbackFn(this._handleBatch.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleBatch(messages: IMessage[]): Promise<void> {
    const out: IMessage[] = [];

    for (const message of messages) {
      if (message.msgName !== ILPQuoteRequestReceivedEvent.name) continue;
      out.push(await this._calculate(message));
    }

    if (out.length > 0) {
      await this._msgProducer.send(out);
    }
  }

  private async _calculate(message: IMessage): Promise<IMessage> {
    const payload =
      message.payload as ILPQuoteRequestReceivedEvent['payload'];

    const result = await this._calculator.calculate({
      peerId: payload.peerId,
      packetId: payload.packetId,
      destinationIlpAddress: payload.destinationIlpAddress,
      incomingAmount: payload.incomingAmount
    });

    if (result.ok) {
      this._logger.debug(
        `[test Payments BC fixture] calculated destinationAmount=${result.destinationAmount} for packet ${payload.packetId}`
      );
      return new RemoteQuoteCalculatedEvent({
        peerId: payload.peerId,
        packetId: payload.packetId,
        destinationAmount: result.destinationAmount
      });
    }

    this._logger.debug(
      `[test Payments BC fixture] could not calculate quote for packet ${payload.packetId}: ${result.reason ?? 'unknown'}`
    );
    return new RemoteQuoteCalculationFailedEvent({
      peerId: payload.peerId,
      packetId: payload.packetId,
      reason: result.reason
    });
  }
}
