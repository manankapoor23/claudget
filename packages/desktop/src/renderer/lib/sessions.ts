import type { SessionStat, UsageSource } from '@claude-widget/core';

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
