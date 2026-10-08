import { Notification, shell } from 'electron';
import type { Logger } from '@claude-widget/core';
import type { AlertMessage, NotificationStatus, NotifyOutcome } from '../shared/notifications';

export const APP_ID = 'com.claudget.app';

/** What the alerters need: whether notifications exist here, and a way to send one. */
export interface AlertSink {
  supported(): boolean;
  send(message: AlertMessage): Promise<NotifyOutcome>;
}

/** How long to wait for the OS to accept or refuse a notification. */
const CONFIRM_MS = 10_000;
/** Notifications kept referenced so clicks still arrive (and macOS keeps them). */
const KEEP = 20;

const SETTINGS_URL: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'x-apple.systempreferences:com.apple.Notifications-Settings.extension',
  win32: 'ms-settings:notifications',
};

/**
 * The one place claudget talks to the OS's notifications.
 *
 * On macOS, Electron (42) posts through UNUserNotificationCenter, which only
 * works for an app with a valid code signature, and asks for permission the
 * first time anything touches `Notification` — so this does that at launch,
 * where the prompt can be answered before the first real alert needs it,
 * rather than in the middle of one. Electron exposes no way to read that
 * permission back: a refusal arrives as the `failed` event on a send
 * ("UNErrorDomain error 1"), so that's recorded, logged, and shown in
 * Settings → Alerts.
 *
 * Every notification is kept referenced until it's closed (up to a few):
 * Electron removes a garbage-collected notification from Notification Center
 * and stops delivering its clicks.
 */
export class Notifier implements AlertSink {
  private readonly live = new Map<string, Notification>();
  private last: NotificationStatus['last'] = null;

  constructor(
    private readonly logger: Logger,
    private readonly onClick: () => void,
  ) {}

  /** Call once the app is ready: on macOS this is what asks for permission. */
  init(): void {
    const supported = this.supported();
    this.logger.info('Notifications', { supported });
  }

  supported(): boolean {
    try {
      return Notification.isSupported();
    } catch {
      return false;
    }
  }

  send(message: AlertMessage): Promise<NotifyOutcome> {
    if (!this.supported()) return Promise.resolve(this.record({ result: 'unsupported' }));
    return new Promise((resolve) => {
      let settled = false;
      const settle = (outcome: NotifyOutcome): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this.record(outcome));
      };
      const timer = setTimeout(() => settle({ result: 'unconfirmed' }), CONFIRM_MS);

      let n: Notification;
      try {
        n = new Notification({
          id: message.id,
          groupId: 'claudget',
          title: message.title,
          body: message.body,
          silent: !message.sound,
          // Linux and Windows. 'critical' keeps it on screen until dismissed
          // on most Linux desktops; Windows shows it with its alarm styling.
          urgency: message.urgent ? 'critical' : 'normal',
          timeoutType: 'default',
        });
      } catch (err) {
        settle({ result: 'failed', error: String(err) });
        return;
      }

      const release = (): void => {
        if (this.live.get(message.id) === n) this.live.delete(message.id);
      };
      n.on('show', () => settle({ result: 'delivered' }));
      n.on('failed', (_event, error) => {
        release();
        settle({ result: 'failed', error });
      });
      n.on('click', () => this.onClick());
      n.on('close', release);

      this.live.get(message.id)?.removeAllListeners();
      this.live.delete(message.id);
      this.live.set(message.id, n);
      while (this.live.size > KEEP) {
        const oldest = this.live.keys().next().value as string;
        this.live.delete(oldest);
      }
      try {
        n.show();
      } catch (err) {
        release();
        settle({ result: 'failed', error: String(err) });
      }
    });
  }

  /** Sends a sample alert now, as Settings → Alerts' "Send test notification" does. */
  test(): Promise<NotifyOutcome> {
    return this.send({
      id: 'claudget-test',
      title: 'claudget notifications work',
      body: 'Limit alerts will look like this. Click it to open claudget.',
      sound: true,
      urgent: false,
    });
  }

  status(): NotificationStatus {
    return {
      supported: this.supported(),
      last: this.last,
      canOpenSettings: SETTINGS_URL[process.platform] !== undefined,
    };
  }

  /** Opens the OS page where notifications are turned on and off. */
  async openSystemSettings(): Promise<void> {
    const url = SETTINGS_URL[process.platform];
    if (url) await shell.openExternal(url);
  }

  private record(outcome: NotifyOutcome): NotifyOutcome {
    this.last = { at: Date.now(), outcome };
    if (outcome.result === 'failed') {
      this.logger.warn('Notification not delivered', { error: outcome.error });
    } else {
      this.logger.debug('Notification', { result: outcome.result });
    }
    return outcome;
  }
}
