/**
 * How the two data sources become one snapshot. Mirrors the real pipeline in
 * packages/core (watch → parse → aggregate, merged with the official usage
 * client, emitted as a snapshot to the renderer) rather than a tidied-up
 * marketing version of it.
 *
 * Drawn with 1px rules and bordered boxes — no fills, no gradients, no images.
 * The layout is a two-column grid with no gap so a column centre lands exactly
 * on 25% / 75%, which is what the connectors are positioned against.
 */
export function Architecture() {
  return (
    <div className="arch">
      <div className="arch__pair">
        <div className="arch__cell">
          <div className="arch__node">
            <span className="lbl">on disk</span>
            <code>~/.claude/projects/**/*.jsonl</code>
          </div>
        </div>
        <div className="arch__cell">
          <div className="arch__node">
            <span className="lbl">optional · network</span>
            <code>api.anthropic.com/…/usage</code>
          </div>
        </div>
      </div>

      <div className="arch__pair arch__pair--drop">
        <i />
        <i />
      </div>

      <div className="arch__pair">
        <div className="arch__cell">
          <div className="arch__node">
            <strong>local usage</strong>
            <span className="lbl">tokens · cost · burn rate</span>
          </div>
        </div>
        <div className="arch__cell">
          <div className="arch__node">
            <strong>plan limits</strong>
            <span className="lbl">5h · weekly · reset</span>
          </div>
        </div>
      </div>

      <div className="arch__join">
        <i />
        <i />
      </div>

      <div className="arch__drop" />

      <div className="arch__node arch__node--accent">
        <strong>claudget</strong>
        <span className="lbl">one snapshot</span>
      </div>

      <div className="arch__drop" />

      <div className="arch__node">
        <strong>desktop widget</strong>
        <span className="lbl">always on top</span>
      </div>

      <p className="arch__caption">
        Local transcripts are the source of truth for spend and work entirely
        offline. If the optional network source is unavailable, the last known
        plan limits are shown as cached and local data keeps flowing.
      </p>
    </div>
  );
}
