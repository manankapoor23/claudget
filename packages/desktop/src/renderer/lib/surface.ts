import type { Surface } from '../../shared/ipc';

/** Which window this renderer is drawing, from the `?surface=` main loaded it with. */
export function currentSurface(): Surface {
  const s = new URLSearchParams(window.location.search).get('surface');
  return s === 'popover' || s === 'pill' || s === 'settings' || s === 'minibar' ? s : 'dashboard';
}
