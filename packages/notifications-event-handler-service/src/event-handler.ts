import {
  CommandTopics,
  EventTopics,
  Message,
  MessageConsumer,
  MessageProducer
} from 'common-types-lib';
import {
  CreateNotificationCmd,
  CreateNotificationCmdPayload,
  NotificationCreatedEvent,
  NotificationCreatedEventPayload
} from 'notifications-domain-lib';

export class NotificationsEventHandler {
  private _msgConsumer: MessageConsumer;
  private _msgProducer: MessageProducer;

  constructor(msgConsumer: MessageConsumer, msgProducer: MessageProducer) {
    this._msgConsumer = msgConsumer;
    this._msgProducer = msgProducer;
  }

  async start(): Promise<void> {
    this._msgConsumer.setTopics([EventTopics.NotificationEvents]);
    this._msgConsumer.setCallbackFn(this._handleEvent.bind(this));
    await this._msgConsumer.connect();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleEvent(message: Message) {
    switch (message.msgName) {
      case NotificationCreatedEvent.name: {
        const payload: NotificationCreatedEventPayload = message.payload;
        const cmdPayload: CreateNotificationCmdPayload = {
          ...payload
        };
        const cmd = new CreateNotificationCmd(cmdPayload, message.requestId);
        cmd.msgTopic = CommandTopics.NotificationCommands;
        await this._msgProducer.send(cmd);
        break;
      }
      default: {
        console.warn(`Unhandled Notification event: ${message.msgName}`);
      }
    }
  }
}
