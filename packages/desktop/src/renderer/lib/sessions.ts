import type { SessionStat, UsageSource } from '@claude-widget/core';
import type { ContextView } from '../../shared/context';
import { formatCompact } from './format';

/** The project folder's name — what people call the project. */
export function projectName(s: SessionStat): string {
  const path = s.projectPath || s.projectSlug;
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path ?? 'unknown';
}

/** What people call each Claude Code front end. */
export function sourceLabel(source: UsageSource | null): string {
  switch (source) {
    case 'cli':
      return 'CLI';
    case 'vscode':
      return 'VS Code';
    case 'desktop':
      return 'Claude app';
    case 'sdk':
      return 'Agent SDK';
    case 'other':
      return 'Other';
    default:
      return 'Unknown';
  }
}

/** "412k of 1M tokens", for a live session's context window (not "1.0M"). */
export function contextAmount(c: ContextView): string {
  const tokens = (n: number): string => formatCompact(n).replace(/\.0(?=[kMB]$)/, '');
  return `${tokens(c.usedTokens)} of ${tokens(c.windowTokens)} tokens`;
}

/** The hover text for a context reading. */
export function contextTitle(c: ContextView): string {
  return `Context window: ${contextAmount(c)}. Claude Code compacts it when it's nearly full.`;
}
