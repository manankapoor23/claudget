/**
 * A limit alert as the system shows it. The strings follow the app's own
 * (packages/desktop/src/main/limit-alerts.ts): "<Limit> limit at N%", or
 * "almost gone" from 95%, over "M% left · resets in …".
 */
export function Notice({ title, body, when }: { title: string; body: string; when: string }) {
  return (
    <div className="ui notice">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="notice__icon" src="/app-icon.png" alt="" width={38} height={38} />
      <div className="notice__text">
        <div className="notice__head">
          <b>{title}</b>
          <span>{when}</span>
        </div>
        <div className="notice__body">{body}</div>
      </div>
    </div>
  );
}
