'use strict';

import { afterEach, describe, mock, test } from 'node:test';
import {
  NotificationAggregate,
  NotificationStatus,
  NotificationType
} from '../src';
import { NotificationSendError } from '../src/interfaces';
import { ConsoleLogger } from 'common-types-lib';
import { MockNotificationRepo } from './mocks';
import { MockNotificationSenderService } from './mocks/mock-notification-sender-service';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert';

const notificationRepository = new MockNotificationRepo();
const notificationSenderService = new MockNotificationSenderService();
const notificationAggregate = new NotificationAggregate(
  notificationRepository,
  notificationSenderService,
  new ConsoleLogger(),
  { retryBaseDelayMs: 0 } // dont wait for tests
);

describe('notification aggregate', () => {
  afterEach(() => {
    notificationRepository.clear();
    mock.restoreAll();
  });

  const type = NotificationType.PaymentCreated;
  const data = {};

  describe('create and send notification', () => {
    test('creates and sends notification successfully', async () => {
      const id = randomUUID();
      const notification =
        await notificationAggregate.createAndSendNotification(id, type, data);
      assert.equal(notification.id, id);
      assert.equal(notification.status, NotificationStatus.SENT);
      assert.equal(notification.attempts, 1);
      assert.ok(notification.sentAt);
    });

    test('retries transient failures then gives up without throwing', async () => {
      let calls = 0;
      mock.method(notificationSenderService, 'send', async () => {
        calls++;
        throw new NotificationSendError('Service Unavailable', {
          status: 503,
          retryable: true
        });
      });

      const id = randomUUID();
      const notification =
        await notificationAggregate.createAndSendNotification(id, type, data);

      assert.equal(notification.status, NotificationStatus.FAILED);
      assert.equal(notification.attempts, notification.maxAttempts);
      assert.equal(calls, notification.maxAttempts);
      assert.ok(!notification.sentAt);

      const stored = await notificationRepository.fetch(id);
      assert.ok(stored);
      assert.equal(stored.status, NotificationStatus.FAILED);
    });

    test('does not retry permanent (non-retryable) failures', async () => {
      let calls = 0;
      mock.method(notificationSenderService, 'send', async () => {
        calls++;
        throw new NotificationSendError('Unauthorized', {
          status: 401,
          retryable: false
        });
      });

      const id = randomUUID();
      const notification =
        await notificationAggregate.createAndSendNotification(id, type, data);

      assert.equal(notification.status, NotificationStatus.FAILED);
      assert.equal(notification.attempts, 1);
      assert.equal(calls, 1);
      assert.ok(!notification.sentAt);
    });
  });
});
