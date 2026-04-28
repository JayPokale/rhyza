import {
  INotification,
  INotificationSenderService
} from 'notifications-domain-lib';

export class NotificationSenderService implements INotificationSenderService {
  // TODO: Implement notification sending
  send(notification: INotification): Promise<void> {
    return Promise.resolve();
  }
}
