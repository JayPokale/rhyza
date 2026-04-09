import {DomainEvent, IMessage, MessageDataFormats, MessageTypes, StateEvent} from 'common-types-lib';
import {JsonBaseMessageSerializer} from "./json-base-msg-serializer";


export class JsonStateEventSerializer extends JsonBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.STATE_EVENT;

  protected _deserializeSpecific(inputObj:any, outputMsg:IMessage): void {
    (outputMsg as StateEvent).aggregateId = inputObj.aggregateId;
    (outputMsg as StateEvent).aggregateVersion = inputObj.aggregateVersion;
  }

}
