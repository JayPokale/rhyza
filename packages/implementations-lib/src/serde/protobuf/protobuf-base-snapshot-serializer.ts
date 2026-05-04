import { ProtoBufBaseMessageSerializer } from './protobuf-base-msg-serializer';
import {
  MessageDataFormats,
  MessageTypes,
  SnapshotEvent
} from 'common-types-lib';
import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';
import { PbKafkaMessageTypes, PbSnapshotEvent } from '../../proto_generated';

export abstract class ProtoBufBaseSnapshotEventSerializer<
  P
> extends ProtoBufBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.SNAPSHOT_EVENT;

  protected abstract _serializePayload(payload: P): Uint8Array;
  protected abstract _deserializePayload(pbAny: PbAny, msgName: string): P;

  serializeMsg(msg: SnapshotEvent): Uint8Array {
    const pbMsg = new PbSnapshotEvent();

    const msgTypeStr =
      msg.msgType.toUpperCase() as keyof typeof PbKafkaMessageTypes;
    pbMsg.setMsgtype(PbKafkaMessageTypes[msgTypeStr]);
    pbMsg.setMsgId(msg.msgId);
    pbMsg.setMsgName(msg.constructor.name);
    pbMsg.setAggregateId(msg.aggregateId);
    pbMsg.setAggregateVersion(msg.aggregateVersion);
    pbMsg.setMsgTimestamp(msg.msgTimestamp);

    pbMsg.setLastEventIndexPartition(msg.lastEventIndexPartition);
    pbMsg.setLastEventIndexOffset(msg.lastEventIndexOffset);

    const pbPayloadBytes = this._serializePayload(msg.payload);

    const someAny = new PbAny();
    someAny.pack(pbPayloadBytes, this._payloadPbClassName, '');
    pbMsg.setPayload(someAny);

    return pbMsg.serializeBinary();
  }

  deserializeMsg(msgBytes: Uint8Array): SnapshotEvent {
    const pbMsg = PbSnapshotEvent.deserializeBinary(msgBytes);

    const evt: SnapshotEvent = {
      msgDataFormat: MessageDataFormats.PROTOBUF,
      msgType: MessageTypes.SNAPSHOT_EVENT,
      msgId: pbMsg.getMsgId(),
      msgTimestamp: pbMsg.getMsgTimestamp(),
      msgName: pbMsg.getMsgName(),
      msgKey: pbMsg.getAggregateId(),
      msgBatchId: null,
      /* These four might be empty here, but are going to be
            updated by the top level deserializer from the kafka data */
      msgTopic: 'null',
      msgPartition: null,
      msgOffset: null,
      lastEventIndexPartition: pbMsg.getLastEventIndexPartition(),
      lastEventIndexOffset: pbMsg.getLastEventIndexOffset(),
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
