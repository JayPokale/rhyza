'use strict';

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { Notification, NotificationStatus } from '../src';
import { NotificationType } from '../dist';

const id = crypto.randomUUID();

describe('notification entity', () => {
  test('creates notification', () => {
    const notification = new Notification(id, NotificationType.PaymentCreated);
    assert.ok(notification);
    assert.equal(notification.id, id);
    assert.equal(notification.status, NotificationStatus.CREATED);
    assert.equal(notification.attempts, 0);
    assert.ok(notification.createdAt);
    assert.ok(!notification.sentAt);
  });

  test('marks notification as sent', () => {
    const notification = new Notification(id, NotificationType.PaymentCreated);
    notification.markAsSent();
    assert.equal(notification.status, NotificationStatus.SENT);
    assert.ok(notification.sentAt);
  });

  test('marks notification as failed', () => {
    const notification = new Notification(id, NotificationType.PaymentCreated);
    notification.markAsFailed();
    assert.equal(notification.status, NotificationStatus.FAILED);
    assert.ok(!notification.sentAt);
  });

  test('converts notification to object', () => {
    const notification = new Notification(id, NotificationType.PaymentCreated);
    const notificationObject = notification.toObject();
    assert.deepEqual(notificationObject, {
      id,
      type: NotificationType.PaymentCreated,
      data: {},
      attempts: 0,
      status: NotificationStatus.CREATED,
      maxAttempts: 3,
      createdAt: notification.createdAt,
      sentAt: null
    });
  });

  test('creates notification from object', () => {
    const notificationObject = {
      id,
      type: NotificationType.PaymentCreated,
      data: {},
      attempts: 0,
      status: NotificationStatus.CREATED,
      maxAttempts: 3,
      createdAt: new Date(),
      sentAt: null
    };
    const notification = Notification.fromObject(notificationObject);
    assert.deepEqual(notification.toObject(), notificationObject);
  });

  test('increments attempts', () => {
    const notification = new Notification(id, NotificationType.PaymentCreated);
    notification.incrementAttempts();
    assert.equal(notification.attempts, 1);
  });
});
