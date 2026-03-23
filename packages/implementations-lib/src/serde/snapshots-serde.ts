import { BaseMessageSerializer, ISerdeDefinition } from './base-serde';
import { MessageTypes, SnapshotEvent } from 'common-types-lib';
import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';
import { PbKafkaMessageTypes, PbSnapshotEvent } from '../proto_generated';

export class SnapshotEventSerializer extends BaseMessageSerializer {
    private static _instance: SnapshotEventSerializer|null = null;

    protected constructor(){
        super();
    }

    static instance():SnapshotEventSerializer {
        if(!this._instance){
            this._instance = new SnapshotEventSerializer();
        }
        return this._instance;
    }


    protected _serialize(serde:ISerdeDefinition, msg: SnapshotEvent): Uint8Array{
        const pbMsg = new PbSnapshotEvent();

        const msgTypeStr = msg.msgType.toUpperCase() as keyof typeof PbKafkaMessageTypes;
        pbMsg.setMsgtype(PbKafkaMessageTypes[msgTypeStr]);
        pbMsg.setMsgId(msg.msgId);
        pbMsg.setMsgName(msg.constructor.name);
        pbMsg.setAggregateId(msg.aggregateId);
        pbMsg.setAggregateVersion(msg.aggregateVersion);
        pbMsg.setMsgTimestamp(msg.msgTimestamp);
        pbMsg.setLastEventIndexPartition(msg.lastEventIndexPartition);
        pbMsg.setLastEventIndexOffset(msg.lastEventIndexOffset);

        const pbPayloadBytes = serde.serialize(msg.payload);

        const someAny = new PbAny();
        someAny.pack(pbPayloadBytes, serde.payloadPbClassName, "");
        pbMsg.setPayload(someAny);

        return pbMsg.serializeBinary();
    }

    protected _deserialize(serde:ISerdeDefinition, data: Uint8Array): SnapshotEvent{
        const pbMsg = PbSnapshotEvent.deserializeBinary(data);

        const evt:SnapshotEvent = {
            msgType: MessageTypes.SNAPSHOT_EVENT,
            msgId: pbMsg.getMsgId(),
            msgTimestamp: pbMsg.getMsgTimestamp(),
            msgName: pbMsg.getMsgName(),
            msgKey: pbMsg.getAggregateId(),
            msgBatchId: null,
            msgTopic: "null",
            msgPartition: null,
            msgOffset: null,
            lastEventIndexPartition: pbMsg.getLastEventIndexPartition(),
            lastEventIndexOffset: pbMsg.getLastEventIndexOffset(),
            aggregateId: pbMsg.getAggregateId(),
            aggregateVersion: pbMsg.getAggregateVersion(),
            payload: null
        }

        if(pbMsg.hasPayload()){
            const pbPayloadAny = pbMsg.getPayload()!;
            evt.payload = serde.deserialize(pbPayloadAny, serde.payloadPbClassName);
        }

        return evt;
    }
}
