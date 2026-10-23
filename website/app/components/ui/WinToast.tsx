/**
 * A limit alert as Windows shows it: a toast in the corner over the taskbar,
 * the app's mark and name on top, then the same title and body as on a Mac
 * (packages/desktop/src/main/limit-alerts.ts).
 */
export function WinToast({ title, body }: { title: string; body: string }) {
  return (
    <div className="ui wtoast">
      <div className="wtoast__app">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tray-logo.png" alt="" width={16} height={16} />
        <span>claudget</span>
        <i className="wtoast__close" />
      </div>
      <b className="wtoast__title">{title}</b>
      <span className="wtoast__body">{body}</span>
    </div>
  );
}
