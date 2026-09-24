import type { SessionStat } from '@claude-widget/core';

/** The project folder's name — what people call the project. */
export function projectName(s: SessionStat): string {
  const path = s.projectPath || s.projectSlug;
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? path ?? 'unknown';
}
