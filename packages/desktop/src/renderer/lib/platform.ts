/**
 * The OS this renderer runs on, resolved once and stamped on <html> so CSS can
 * use it. Imported first by main.tsx: ES imports run before the importing
 * module's own code, so anything that needs the platform at module load must
 * read it from here, not from the DOM attribute.
 */
export const PLATFORM: string =
  window.claudeWidget?.platform ??
  // Browser demo only: `?platform=darwin` previews the Mac chrome.
  new URLSearchParams(window.location.search).get('platform') ??
  'web';

export const IS_MAC = PLATFORM === 'darwin';

document.documentElement.dataset.platform = PLATFORM;

/**
 * Linux without a compositor (main passes `?opaque=1`): windows are opaque,
 * so nothing may rely on see-through corners. See main/compositor.ts.
 */
export const OPAQUE = new URLSearchParams(window.location.search).get('opaque') === '1';
if (OPAQUE) document.documentElement.dataset.opaque = '';
