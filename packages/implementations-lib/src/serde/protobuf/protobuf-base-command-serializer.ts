import { ProtoBufBaseMessageSerializer } from './protobuf-base-msg-serializer';
import {CommandMsg, MessageDataFormats, MessageTypes} from 'common-types-lib';
import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';
import {PbCommandMsg, PbKafkaMessageTypes} from '../../proto_generated';


export abstract class ProtoBufBaseCommandSerializer<P> extends ProtoBufBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.COMMAND;

  protected abstract _serializePayload(payload:P):Uint8Array;
  protected abstract _deserializePayload(pbAny:PbAny, msgName:string): P;

  serializeMsg(msg: CommandMsg):Uint8Array {
    const pbMsg = new PbCommandMsg();

    const msgTypeStr =
      msg.msgType.toUpperCase() as keyof typeof PbKafkaMessageTypes;
    pbMsg.setMsgtype(PbKafkaMessageTypes[msgTypeStr]);
    pbMsg.setMsgId(msg.msgId);
    pbMsg.setMsgName(msg.constructor.name);
    pbMsg.setAggregateId(msg.aggregateId);

    pbMsg.setRequestId(msg.requestId);
    pbMsg.setMsgTimestamp(msg.msgTimestamp);

    const pbPayloadBytes = this._serializePayload(msg.payload);

    const someAny = new PbAny();
    someAny.pack(pbPayloadBytes, this._payloadPbClassName, '');
    pbMsg.setPayload(someAny);

    return pbMsg.serializeBinary();
  }

  deserializeMsg(msgBytes:Uint8Array): CommandMsg {
    const pbMsg = PbCommandMsg.deserializeBinary(msgBytes);

    const cmd: CommandMsg = {
      msgDataFormat: MessageDataFormats.PROTOBUF,
      msgType: MessageTypes.COMMAND,
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
      requestId: pbMsg.getRequestId(),
      payload: null
    };

    if (pbMsg.hasPayload()) {
      const pbPayloadAny = pbMsg.getPayload()!;
      cmd.payload = this._deserializePayload(pbPayloadAny, this._payloadPbClassName);
    }

    return cmd;
  }
}
