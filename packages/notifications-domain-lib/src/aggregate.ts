'use strict';

import { ILogger } from 'common-types-lib';
import { Notification } from './entity';
import {
  INotification,
  INotificationRepository,
  INotificationSenderService,
  NotificationSendError,
  NotificationType
} from './interfaces';

const DEFAULT_RETRY_BASE_DELAY_MS = 500;

export interface NotificationAggregateOptions {
  // Base delay for exponential backoff between transient retry attempts.
  // Set to 0 in tests to avoid waits.
  retryBaseDelayMs?: number;
}

export class NotificationAggregate {
  private _repo: INotificationRepository;
  private _notificationSenderService: INotificationSenderService;
  private _retryBaseDelayMs: number;
  private _logger: ILogger;

  constructor(
    repo: INotificationRepository,
    notificationSenderService: INotificationSenderService,
    logger: ILogger,
    options: NotificationAggregateOptions = {}
  ) {
    this._repo = repo;
    this._notificationSenderService = notificationSenderService;
    this._logger = logger.child('notification-aggregate');
    this._retryBaseDelayMs =
      options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  }

  /**
   * Persist a notification and attempt to deliver it, retrying transient
   * failures with bounded exponential backoff up to `maxAttempts`.
   *
   * `id` is the source event id (not generated here) so redeliveries are idempotent.
   */
  async createAndSendNotification(
    id: string,
    type: NotificationType,
    data: Record<string, unknown>
  ): Promise<INotification> {
    const notification = new Notification(id, type, data);
    await this._repo.store(notification.toObject());

    while (notification.attempts < notification.maxAttempts) {
      notification.incrementAttempts();
      try {
        await this._notificationSenderService.send(notification);
        notification.markAsSent();
        await this._repo.store(notification.toObject());
        return notification.toObject();
      } catch (error) {
        notification.markAsFailed();
        await this._repo.store(notification.toObject());

        const retryable =
          error instanceof NotificationSendError ? error.retryable : true;

        if (!retryable) {
          this._logger.error(
            `Notification ${id} (${type}) permanently failed (non-retryable) ` +
              `after ${notification.attempts} attempt(s): ${(error as Error).message}`
          );
          return notification.toObject();
        }

        // Exponential backoff before the next attempt: base * 2^(attempt-1).
        // For base=500ms, maxAttempts=3: backoff is 500ms, 1000ms, 2000ms, stop
        if (notification.attempts < notification.maxAttempts) {
          await this._delay(
            this._retryBaseDelayMs * 2 ** (notification.attempts - 1)
          );
        }
      }
    }

    this._logger.error(
      `Notification ${id} (${type}) permanently failed (retries exhausted) ` +
        `after ${notification.attempts} attempt(s)`
    );
    return notification.toObject();
  }

  private _delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
