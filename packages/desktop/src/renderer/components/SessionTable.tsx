import { useMemo, useState, type JSX } from 'react';
import type { ActiveSession, SessionStat } from '@claude-widget/core';
import { getBridge } from '../lib/api';
import { useCostCopy } from '../lib/billing';
import { formatCompact, formatRelative, formatUSD } from '../lib/format';
import { projectName } from '../lib/sessions';
import { CopyIcon, FolderIcon, SortIcon } from './icons';

type SortKey = 'project' | 'tokens' | 'cost' | 'last';
type Dir = 'asc' | 'desc';

interface SessionTableProps {
  sessions: SessionStat[];
  activeSessions: ActiveSession[];
  currency: string;
}

const DEFAULT_DIR: Record<SortKey, Dir> = {
  project: 'asc',
  tokens: 'desc',
  cost: 'desc',
  last: 'desc',
};

/**
 * Sessions as a real table: sortable columns, a filter, and per-row actions
 * to open the project in Finder or copy its path. Metadata only — transcript
 * contents never leave the files they're in.
 */
export function SessionTable({
  sessions,
  activeSessions,
  currency,
}: SessionTableProps): JSX.Element {
  const cost = useCostCopy();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: Dir }>({ key: 'last', dir: 'desc' });
  const [copied, setCopied] = useState<string | null>(null);
  const live = useMemo(() => new Set(activeSessions.map((s) => s.sessionId)), [activeSessions]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? sessions.filter((s) =>
          [projectName(s), s.sessionTitle, s.gitBranch, s.projectPath]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q)),
        )
      : sessions;
    const sign = sort.dir === 'asc' ? 1 : -1;
    const value = (s: SessionStat): number | string =>
      sort.key === 'project'
        ? projectName(s).toLowerCase()
        : sort.key === 'tokens'
          ? s.tokens.total
          : sort.key === 'cost'
            ? s.costUSD
            : s.lastAt;
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sign;
    });
  }, [sessions, query, sort]);

  const maxTokens = rows.reduce((m, s) => Math.max(m, s.tokens.total), 0) || 1;
  const bridge = getBridge();

  const header = (key: SortKey, label: string, align: 'start' | 'end' = 'start'): JSX.Element => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        className={align === 'end' ? 'st__num' : undefined}
        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          className={active ? 'st__sort st__sort--on' : 'st__sort'}
          onClick={() =>
            setSort((s) =>
              s.key === key
                ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                : { key, dir: DEFAULT_DIR[key] },
            )
          }
        >
          {label}
          <SortIcon dir={active ? sort.dir : null} />
        </button>
      </th>
    );
  };

  const copy = (path: string): void => {
    void navigator.clipboard
      .writeText(path)
      .then(() => {
        setCopied(path);
        window.setTimeout(() => setCopied((c) => (c === path ? null : c)), 1200);
      })
      .catch(() => {
        /* clipboard unavailable — the path is still in the tooltip */
      });
  };

  return (
    <section className="st" aria-label="Sessions">
      <div className="st__bar">
        <input
          id="session-filter"
          className="st__filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by project, branch or title"
          aria-label="Filter sessions"
        />
        <span className="st__count">
          {rows.length} of {sessions.length}
        </span>
      </div>

      {sessions.length === 0 ? (
        <p className="sect__empty">
          No sessions yet — start Claude Code and they&apos;ll appear here.
        </p>
      ) : rows.length === 0 ? (
        <p className="sect__empty">Nothing matches “{query}”.</p>
      ) : (
        <div className="st__scroll">
          <table className="st__table">
            <thead>
              <tr>
                {header('project', 'Project')}
                {header('tokens', 'Tokens', 'end')}
                {header('cost', cost.included ? 'API value' : 'Cost', 'end')}
                {header('last', 'Last active', 'end')}
                <th scope="col" className="st__actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.sessionId}>
                  <td>
                    <div className="st__project">
                      <span
                        className={live.has(s.sessionId) ? 'st__dot st__dot--live' : 'st__dot'}
                      />
                      <div className="st__names">
                        <strong title={s.projectPath}>{projectName(s)}</strong>
                        <span title={s.sessionTitle || undefined}>
                          {s.sessionTitle || s.gitBranch || 'Untitled session'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="st__num">
                    <div className="st__tokens">
                      <span className="st__meter">
                        <span style={{ width: `${(s.tokens.total / maxTokens) * 100}%` }} />
                      </span>
                      {formatCompact(s.tokens.total)}
                    </div>
                  </td>
                  <td className="st__num">{formatUSD(s.costUSD, currency)}</td>
                  <td className="st__num st__muted">
                    {live.has(s.sessionId) ? 'Now' : formatRelative(s.lastAt)}
                  </td>
                  <td className="st__actions">
                    <button
                      type="button"
                      className="iconbtn"
                      title="Show in Finder"
                      onClick={() => void bridge?.revealProject(s.projectPath)}
                    >
                      <FolderIcon />
                    </button>
                    <button
                      type="button"
                      className={copied === s.projectPath ? 'iconbtn iconbtn--active' : 'iconbtn'}
                      title={copied === s.projectPath ? 'Copied' : 'Copy project path'}
                      onClick={() => copy(s.projectPath)}
                    >
                      <CopyIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
