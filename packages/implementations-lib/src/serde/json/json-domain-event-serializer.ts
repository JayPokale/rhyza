import {CommandMsg, DomainEvent, IMessage, MessageDataFormats, MessageTypes} from 'common-types-lib';
import {JsonBaseMessageSerializer} from "./json-base-msg-serializer";


export class JsonDomainEventSerializer extends JsonBaseMessageSerializer {
  public msgType: MessageTypes = MessageTypes.DOMAIN_EVENT;

  protected _deserializeSpecific(inputObj:any, outputMsg:IMessage): void {
    (outputMsg as DomainEvent).aggregateId = inputObj.aggregateId;
  }

}
