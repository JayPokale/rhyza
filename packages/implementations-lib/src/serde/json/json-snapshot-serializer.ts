import {DomainEvent, IMessage, MessageDataFormats, MessageTypes, SnapshotEvent, StateEvent} from 'common-types-lib';
import {JsonBaseMessageSerializer} from "./json-base-msg-serializer";


export class JsonSnapshotSerializer extends JsonBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.SNAPSHOT_EVENT;

  protected _deserializeSpecific(inputObj:any, outputMsg:IMessage): void {
    (outputMsg as SnapshotEvent).aggregateId = inputObj.aggregateId;
    (outputMsg as SnapshotEvent).aggregateVersion = inputObj.aggregateVersion;
    (outputMsg as SnapshotEvent).lastEventIndexPartition = inputObj.lastEventIndexPartition;
    (outputMsg as SnapshotEvent).lastEventIndexOffset = inputObj.lastEventIndexOffset;
  }

}
