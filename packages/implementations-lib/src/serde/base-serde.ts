import { IMessage, IRawMessage, IRawMessageHeader } from 'common-types-lib';
import { Any as PbAny } from 'google-protobuf/google/protobuf/any_pb';

export interface ISerdeDefinition {
  payloadPbClassName: string;
  // evtClass: SnapshotEventInherited,
  serialize: (payload: any) => Uint8Array;
  deserialize: (pbAny: PbAny, msgName: string) => any;
}

export abstract class BaseMessageSerializer {
    protected _serdeMap: Map<string, ISerdeDefinition> = new Map();

    protected constructor(){
    }

    protected abstract _serialize(serde:ISerdeDefinition, msg: IMessage): Uint8Array;
    protected abstract _deserialize(serde:ISerdeDefinition, data: Uint8Array): IMessage;

    setSerde(msgName: string, serde: ISerdeDefinition): void {
        this._serdeMap.set(msgName, serde);
    }

    serialize(msg: IMessage): IRawMessage {
        const serde = this._serdeMap.get(msg.msgName);
        if (!serde) {
            throw new Error(`Event class not registered: ${msg.msgName}`);
        }
        const data = this._serialize(serde, msg);

        const headers: IRawMessageHeader[] = [
            {msgType: msg.msgType},
            {msgName: msg.msgName},
        ]

        const rawMsg:IRawMessage = {
            topic: msg.msgTopic,
            key: msg.msgKey,
            timestamp: msg.msgTimestamp,
            value: data,
            offset: msg.msgOffset,
            partition: msg.msgPartition,
            headers: headers
        };

        return rawMsg;
    }

    deserialize(rawMsg: IRawMessage) : IMessage{
        if(!rawMsg.value) throw new Error("Invalid message, missing value");
        if(!rawMsg.headers) throw new Error("Invalid message, missing headers");
        const msgTypeHeader = rawMsg.headers.find(value => value["msgType"]);
        const msgType = msgTypeHeader ? msgTypeHeader["msgType"].toString() : null;
        const msgNameHeader = rawMsg.headers.find(value => value["msgName"]);
        const msgName = msgNameHeader ? msgNameHeader["msgName"].toString() : null;

        if(!msgType || !msgName) {
            throw new Error("Invalid message, missing msgType or msgName");
        }

        const serde = this._serdeMap.get(msgName);
        if (!serde) {
            throw new Error(`StateEvent class not registered: ${msgName}`);
        }

        const msg = this._deserialize(serde, rawMsg.value as Uint8Array);

        // put back common stuff the specialized serializer can't know of
        msg.msgPartition = rawMsg.partition;
        msg.msgOffset = rawMsg.offset;
        msg.msgTopic = rawMsg.topic;
        msg.msgKey = rawMsg.key ? rawMsg.key.toString() : null;

        return msg;
    }
}
