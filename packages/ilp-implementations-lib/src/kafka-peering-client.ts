import { ILogger, ConsoleLogger, IMessageProducer } from 'common-types-lib';
import {
  DispatchPreparePacketCmd,
  DispatchRejectPacketCmd,
  IPeeringClient,
  PacketDispatch,
  RejectDispatch
} from 'ilp-domain-lib';

export class KafkaPeeringClient implements IPeeringClient {
  constructor(
    private readonly _producer: IMessageProducer,
    private readonly _logger: ILogger = new ConsoleLogger()
  ) {}

  async dispatch(input: PacketDispatch): Promise<void> {
    const cmd = new DispatchPreparePacketCmd({
      peerId: input.peerId,
      packetId: input.packetId,
      paymentIntentId: input.paymentIntentId,
      destinationIlpAddress: input.destinationIlpAddress,
      amount: input.type === 'QUOTE' ? input.sourceAmount : input.amount,
      expiresAt: input.expiresAt,
      // A quote is an unfulfillable probe, so a random condition is correct (for now).
      // TODO: once we have STREAM, the execution condition (and the
      // packet `data`) for both quotes and payments will be produced by the
      // aggregate and carried on the dispatch instead of added here.
      executionCondition: Buffer.from(
        crypto.getRandomValues(new Uint8Array(32))
      ).toString('base64')
    });

    this._logger.debug(
      `Dispatching ${input.type} prepare for packet ${input.packetId} to peer ${input.peerId}`
    );
    await this._producer.send(cmd);
  }

  async dispatchReject(input: RejectDispatch): Promise<void> {
    const cmd = new DispatchRejectPacketCmd({
      peerId: input.peerId,
      packetId: input.packetId,
      replyHandle: input.replyHandle,
      rejectCode: input.rejectCode,
      rejectMessage: input.rejectMessage,
      triggeredBy: input.triggeredBy,
      // For a quote response we put the destination amount here as a stand-in for STREAM reply frames.
      data:
        input.destinationAmount !== undefined
          ? Buffer.from(
              JSON.stringify({ destinationAmount: input.destinationAmount })
            ).toString('base64')
          : undefined
    });

    this._logger.debug(
      `Dispatching reject (${input.rejectCode}) for packet ${input.packetId} to peer ${input.peerId}`
    );
    await this._producer.send(cmd);
  }
}
