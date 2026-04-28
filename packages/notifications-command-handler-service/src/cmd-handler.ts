import {
  CommandTopics,
  Message,
  MessageConsumer,
  MessageProducer
} from 'common-types-lib';
import {
  CreateNotificationCmd,
  NotificationAggregate,
  NotificationCreatedEvent
} from 'notifications-domain-lib';

export class NotificationsCommandHandler {
  private _msgConsumer: MessageConsumer;
  private _msgProducer: MessageProducer;
  private _notificationAggregate: NotificationAggregate;

  constructor(
    msgConsumer: MessageConsumer,
    msgProducer: MessageProducer,
    notificationAggregate: NotificationAggregate
  ) {
    this._msgConsumer = msgConsumer;
    this._msgProducer = msgProducer;
    this._notificationAggregate = notificationAggregate;
  }

  async start(): Promise<void> {
    this._msgConsumer.setTopics([CommandTopics.NotificationCommands]);
    this._msgConsumer.setBatchCallbackFn(this._handleBatch.bind(this));
    await this._msgConsumer.connect();
    await this._msgConsumer.startAndWaitForRebalance();
  }

  async stop(): Promise<void> {
    await this._msgConsumer.stop();
    await this._msgConsumer.disconnect(true);
  }

  private async _handleBatch(messages: Message[]): Promise<void> {
    const eventsToPublish: Message[] = [];
    const unhandled: Message[] = [];

    for (const msg of messages) {
      switch (msg.msgName) {
        case CreateNotificationCmd.name:
          const event = await this._createAndSendNotification(
            msg as CreateNotificationCmd
          );
          eventsToPublish.push(event);
          break;
        default:
          unhandled.push(msg);
          break;
      }
    }

    if (unhandled.length > 0) {
      console.warn(
        `Unhandled Notification command: ${[...new Set(unhandled.map((m) => m.msgName))].join(', ')}`
      );
    }

    if (eventsToPublish.length > 0) {
      await this._msgProducer.send(eventsToPublish);
    }
  }

  private async _createAndSendNotification(
    cmd: CreateNotificationCmd
  ): Promise<Message> {
    const notificationId =
      await this._notificationAggregate.createAndSendNotification(
        cmd.payload.data
      );
    return new NotificationCreatedEvent(
      { id: notificationId, data: cmd.payload.data },
      cmd.requestId
    );
  }
}
