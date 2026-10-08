import { describe, expect, it } from 'vitest';
import { notificationStatusLine, refusalReason, type NotificationStatus } from './notifications';

describe('refusalReason', () => {
  it('puts macOS’s not-allowed error in words', () => {
    expect(refusalReason('The operation couldn’t be completed. (UNErrorDomain error 1.)')).toBe(
      'notifications aren’t allowed for claudget',
    );
    expect(refusalReason('Notifications are not allowed for this application')).toBe(
      'notifications aren’t allowed for claudget',
    );
  });
  it('passes anything else through', () => {
    expect(refusalReason('Toast failed. ')).toBe('Toast failed');
  });
});

describe('notificationStatusLine', () => {
  const base: NotificationStatus = { supported: true, last: null, canOpenSettings: true };
  const failed = {
    at: 1,
    outcome: {
      result: 'failed' as const,
      error: 'The operation couldn’t be completed. (UNErrorDomain error 1.)',
    },
  };

  it('asks for a test first, and for Allow on macOS', () => {
    expect(notificationStatusLine(base, true)).toEqual({
      text: 'Send a test to check they arrive. If macOS asks, choose Allow.',
      offerSettings: true,
    });
  });
  it('says why the last one was refused, with the way to System Settings', () => {
    expect(notificationStatusLine({ ...base, last: failed }, true)).toEqual({
      text: 'The last one was refused: notifications aren’t allowed for claudget. Turn them on for claudget in System Settings, then send a test.',
      offerSettings: true,
    });
  });
  it('mentions Focus once one has reached Notification Center', () => {
    const delivered = { at: 1, outcome: { result: 'delivered' as const } };
    expect(notificationStatusLine({ ...base, last: delivered }, true)).toEqual({
      text: 'The last one reached Notification Center. During Focus, banners wait there.',
      offerSettings: false,
    });
    expect(notificationStatusLine({ ...base, last: delivered }, false).text).toBe(
      'The last one was delivered.',
    );
  });
  it('is honest when the OS never answered', () => {
    const unconfirmed = { at: 1, outcome: { result: 'unconfirmed' as const } };
    expect(
      notificationStatusLine({ ...base, last: unconfirmed, canOpenSettings: false }, false),
    ).toEqual({
      text: 'Sent. If nothing appeared, check notifications for claudget in Settings.',
      offerSettings: false,
    });
  });
  it('offers nothing where notifications don’t exist', () => {
    expect(notificationStatusLine({ ...base, supported: false }, false)).toEqual({
      text: 'This system can’t show notifications.',
      offerSettings: false,
    });
  });
});
