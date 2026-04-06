import {DomainEvent, IMessage, IMessageProducer, IMessageProducerAcks} from "common-types-lib";
import * as events from "node:events";

export class MockMessageProducer implements IMessageProducer {
    private _messages: IMessage[] = [];

    get messages(): IMessage[] {
      return this._messages;
    }

    destroy(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    connect(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    disconnect(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    sendWithAck(message: IMessage[]): Promise<IMessageProducerAcks[]> {
      this._messages.push(...message);
      return Promise.resolve([{topic: message[0].msgTopic, lastMsgOffset:0, partition:0}]);
    }

    send(events: IMessage[]): Promise<void> {
        this._messages.push(...events);
        return Promise.resolve();
    }


}
