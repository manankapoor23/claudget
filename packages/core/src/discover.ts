import { prettifyProjectSlug } from './paths';
import { walkFiles } from './util/fs';

export interface TranscriptFile {
  path: string;
  projectSlug: string;
  projectPath: string;
  mtimeMs: number;
  size: number;
}

/**
 * Finds every usage-bearing transcript under the projects directory, including
 * subagent and workflow-agent transcripts (their token usage counts too).
 * Workflow `journal.jsonl` files are excluded as they carry no usage records.
 */
export async function discoverTranscripts(projectsDir: string): Promise<TranscriptFile[]> {
  const files = await walkFiles(projectsDir, (p) => p.endsWith('.jsonl'));
  return files
    .filter((f) => !f.path.endsWith('journal.jsonl'))
    .map((f) => ({
      path: f.path,
      projectSlug: f.topDir,
      projectPath: prettifyProjectSlug(f.topDir),
      mtimeMs: f.mtimeMs,
      size: f.size,
    }));
}
