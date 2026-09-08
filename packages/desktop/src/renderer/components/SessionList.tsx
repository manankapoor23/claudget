import type { JSX } from 'react';
import type { ActiveSession, SessionStat } from '@claude-widget/core';
import { formatCompact, formatRelative } from '../lib/format';

interface SessionListProps {
  sessions: SessionStat[];
  activeSessions: ActiveSession[];
  limit: number;
}

function projectName(s: SessionStat): string {
  const path = s.projectPath || s.projectSlug;
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path ?? 'unknown';
}

function sessionLabel(s: SessionStat): string {
  const project = projectName(s);
  if (s.sessionTitle) return project + ' · ' + s.sessionTitle;
  if (s.gitBranch && s.gitBranch !== 'HEAD') return project + ' · ' + s.gitBranch;
  return project;
}

function sessionTooltip(s: SessionStat): string {
  const details = [s.projectPath, s.gitBranch, s.sessionTitle].filter(Boolean);
  return details.join(' · ') || s.sessionId;
}

export function SessionList({
  sessions,
  activeSessions,
  limit,
}: SessionListProps): JSX.Element | null {
  if (sessions.length === 0) return null;

  const liveIds = new Set(activeSessions.map((a) => a.sessionId));
  const rows = [...sessions].sort((a, b) => b.lastAt - a.lastAt).slice(0, limit);

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Recent sessions</span>
      </div>
      <div className="sessions">
        {rows.map((s) => {
          const live = liveIds.has(s.sessionId);
          return (
            <div className="session" key={s.sessionId} title={sessionTooltip(s)}>
              <span className="session__dot" />
              <span className="session__name">{sessionLabel(s)}</span>
              <span className="session__val">{formatCompact(s.tokens.total)}</span>
              <span className="session__time">{live ? 'live' : formatRelative(s.lastAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
