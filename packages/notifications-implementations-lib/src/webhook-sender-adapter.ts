import {
  INotification,
  INotificationSenderService
} from 'notifications-domain-lib';

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/webhooks';

export class WebhookSenderAdapter implements INotificationSenderService {
  async send(notification: INotification): Promise<void> {
    const requestHeaders = {
      'Content-Type': 'application/json'
    };
    const body = {
      id: notification.id,
      type: notification.type,
      data: notification.data
    };
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(
        `Failed to send notification with id ${notification.id}: ${response.statusText}`
      );
    }
  }
}
