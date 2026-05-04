import { ProtoBufBaseMessageSerializer } from './protobuf-base-msg-serializer';
import { MessageDataFormats, MessageTypes, StateEvent } from 'common-types-lib';
import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';
import { PbKafkaMessageTypes, PbStateEvent } from '../../proto_generated';

export abstract class ProtoBufBaseStateEventSerializer<
  P
> extends ProtoBufBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.STATE_EVENT;

  protected abstract _serializePayload(payload: P): Uint8Array;
  protected abstract _deserializePayload(pbAny: PbAny, msgName: string): P;

  serializeMsg(msg: StateEvent): Uint8Array {
    const pbMsg = new PbStateEvent();

    const msgTypeStr =
      msg.msgType.toUpperCase() as keyof typeof PbKafkaMessageTypes;
    pbMsg.setMsgtype(PbKafkaMessageTypes[msgTypeStr]);
    pbMsg.setMsgId(msg.msgId);
    pbMsg.setMsgName(msg.constructor.name);
    pbMsg.setAggregateId(msg.aggregateId);
    pbMsg.setAggregateVersion(msg.aggregateVersion);
    pbMsg.setMsgTimestamp(msg.msgTimestamp);

    const pbPayloadBytes = this._serializePayload(msg.payload);

    const someAny = new PbAny();
    someAny.pack(pbPayloadBytes, this._payloadPbClassName, '');
    pbMsg.setPayload(someAny);

    return pbMsg.serializeBinary();
  }

  deserializeMsg(msgBytes: Uint8Array): StateEvent {
    const pbMsg = PbStateEvent.deserializeBinary(msgBytes);

    const evt: StateEvent = {
      msgDataFormat: MessageDataFormats.PROTOBUF,
      msgType: MessageTypes.STATE_EVENT,
      msgId: pbMsg.getMsgId(),
      msgTimestamp: pbMsg.getMsgTimestamp(),
      msgName: pbMsg.getMsgName(),
      msgBatchId: null,
      /* These four might be empty here, but are going to be
      updated by the top level deserializer from the kafka data */
      msgKey: null,
      msgTopic: 'null',
      msgPartition: null,
      msgOffset: null,
      aggregateId: pbMsg.getAggregateId(),
      aggregateVersion: pbMsg.getAggregateVersion(),
      payload: null
    };

    if (pbMsg.hasPayload()) {
      const pbPayloadAny = pbMsg.getPayload()!;
      evt.payload = this._deserializePayload(
        pbPayloadAny,
        this._payloadPbClassName
      );
    }

    return evt;
  }
}
