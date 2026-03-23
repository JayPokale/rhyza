import { BaseMessageSerializer, ISerdeDefinition } from './base-serde';
import { MessageTypes, StateEvent } from 'common-types-lib';
import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';
import { PbKafkaMessageTypes, PbStateEvent } from '../proto_generated';

export class StateEventSerializer extends BaseMessageSerializer {
  private static _instance: StateEventSerializer | null = null;

  protected constructor() {
    super();
  }

  static instance(): StateEventSerializer {
    if (!this._instance) {
      this._instance = new StateEventSerializer();
    }
    return this._instance;
  }

  protected _serialize(serde: ISerdeDefinition, msg: StateEvent): Uint8Array {
    const pbMsg = new PbStateEvent();

    const msgTypeStr =
      msg.msgType.toUpperCase() as keyof typeof PbKafkaMessageTypes;
    pbMsg.setMsgtype(PbKafkaMessageTypes[msgTypeStr]);
    pbMsg.setMsgId(msg.msgId);
    pbMsg.setMsgName(msg.constructor.name);
    pbMsg.setAggregateId(msg.aggregateId);
    pbMsg.setAggregateVersion(msg.aggregateVersion);
    pbMsg.setMsgTimestamp(msg.msgTimestamp);

    const pbPayloadBytes = serde.serialize(msg.payload);

    const someAny = new PbAny();
    someAny.pack(pbPayloadBytes, serde.payloadPbClassName, '');
    pbMsg.setPayload(someAny);

    return pbMsg.serializeBinary();
  }
  protected _deserialize(
    serde: ISerdeDefinition,
    data: Uint8Array
  ): StateEvent {
    const pbMsg = PbStateEvent.deserializeBinary(data);

    const evt: StateEvent = {
      msgType: MessageTypes.STATE_EVENT,
      msgId: pbMsg.getMsgId(),
      msgTimestamp: pbMsg.getMsgTimestamp(),
      msgName: pbMsg.getMsgName(),
      msgKey: null,
      msgBatchId: null,
      msgTopic: 'null',
      msgPartition: null,
      msgOffset: null,
      aggregateId: pbMsg.getAggregateId(),
      aggregateVersion: pbMsg.getAggregateVersion(),
      payload: null
    };

    if (pbMsg.hasPayload()) {
      const pbPayloadAny = pbMsg.getPayload()!;
      evt.payload = serde.deserialize(pbPayloadAny, serde.payloadPbClassName);
    }

    return evt;
  }
}
