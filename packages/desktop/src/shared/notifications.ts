/** What an alert says. Platform details (sound, urgency) are the notifier's job. */
export interface AlertMessage {
  /**
   * Stable per alert: macOS and Windows replace a delivered notification that
   * has the same id instead of stacking a second one.
   */
  id: string;
  title: string;
  body: string;
  /** Play the system sound. Off for early warnings, on when a limit is nearly gone. */
  sound: boolean;
  /** Nearly out: critical urgency where the platform has one (Linux, Windows). */
  urgent: boolean;
}

/**
 * How handing a notification to the OS went.
 * - `delivered`: the OS accepted it. On macOS that puts it in Notification
 *   Center; whether a banner also shows is up to Focus and the alert style.
 * - `failed`: the OS refused it; `error` is its reason.
 * - `unconfirmed`: shown, but the OS never said either way (some Linux
 *   notification daemons don't).
 * - `unsupported`: this system has no notifications at all.
 */
export type NotifyOutcome =
  | { result: 'delivered' }
  | { result: 'unconfirmed' }
  | { result: 'failed'; error: string }
  | { result: 'unsupported' };

/**
 * What Settings → Alerts shows. Electron exposes no way to read the system's
 * notification permission, and macOS 26 keeps it where an app shouldn't go
 * looking, so the honest signal is what the OS said to the last notification.
 */
export interface NotificationStatus {
  supported: boolean;
  /** The last notification claudget sent this run (an alert or a test), if any. */
  last: { at: number; outcome: NotifyOutcome } | null;
  /** Whether there's a system settings page to send people to (macOS, Windows). */
  canOpenSettings: boolean;
}

/** What the OS calls the app where notifications are switched on. */
export function settingsAppName(mac: boolean): string {
  return mac ? 'System Settings' : 'Settings';
}

/**
 * The OS's reason for refusing a notification, in words. macOS's own is
 * "The operation couldn't be completed. (UNErrorDomain error 1.)", which
 * means notifications are off for the app, or were never allowed.
 */
export function refusalReason(error: string): string {
  if (/UNErrorDomain error 1\b/.test(error) || /not allowed/i.test(error)) {
    return 'notifications aren’t allowed for claudget';
  }
  return error.trim().replace(/\.$/, '');
}

/** The line Settings → Alerts shows about notifications, and whether to offer the OS's settings. */
export function notificationStatusLine(
  s: NotificationStatus | null,
  mac: boolean,
): { text: string; offerSettings: boolean } {
  const name = settingsAppName(mac);
  if (!s) return { text: 'Checking…', offerSettings: false };
  if (!s.supported) return { text: 'This system can’t show notifications.', offerSettings: false };
  const last = s.last?.outcome ?? null;
  switch (last?.result) {
    case 'failed':
      return {
        text: `The last one was refused: ${refusalReason(last.error)}. Turn them on for claudget in ${name}, then send a test.`,
        offerSettings: s.canOpenSettings,
      };
    case 'delivered':
      return {
        text: mac
          ? 'The last one reached Notification Center. During Focus, banners wait there.'
          : 'The last one was delivered.',
        offerSettings: false,
      };
    case 'unconfirmed':
      return {
        text: `Sent. If nothing appeared, check notifications for claudget in ${name}.`,
        offerSettings: s.canOpenSettings,
      };
    default:
      return {
        text: mac
          ? 'Send a test to check they arrive. If macOS asks, choose Allow.'
          : 'Send a test to check they arrive.',
        offerSettings: s.canOpenSettings,
      };
  }
}
