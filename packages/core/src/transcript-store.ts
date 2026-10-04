import { promises as fs } from 'node:fs';
import { createTranscriptParser, type ParseContext, type TranscriptParser } from './parse';
import type { UsageEntry } from './types';

/** Bytes read per chunk. Lines longer than this are stitched across chunks. */
const CHUNK_BYTES = 1 << 20;
/** Transcripts parsed at once during a full scan. */
const SCAN_CONCURRENCY = 4;
const NEWLINE = 0x0a;

interface FileState {
  ctx: ParseContext;
  parser: TranscriptParser;
  entries: UsageEntry[];
  /** Bytes consumed so far: always the end of a complete line. */
  offset: number;
  /** stat at the last read, to skip files that haven't changed. */
  mtimeMs: number;
  size: number;
}

export interface TranscriptRef extends ParseContext {
  path: string;
}

/**
 * The parsed usage entries of every transcript, kept up to date incrementally.
 *
 * Transcripts are append-only JSONL and a heavy user has hundreds of MB of
 * them. Reading every file whole on every rescan (and every changed file whole
 * on every watcher tick) held the whole tree in memory at once — a ~650 MB
 * spike every two minutes that the main process never gave back. Instead:
 *
 * - an unchanged file (same size and mtime) is not read at all;
 * - a grown file is read from where the last read stopped;
 * - a file is streamed in 1 MB chunks, so at most one chunk and one line per
 *   file are in memory, never the file;
 * - a shrunk file (rewritten or truncated) is parsed again from the start.
 *
 * Only the compact {@link UsageEntry} list is retained per file.
 */
export class TranscriptStore {
  private files = new Map<string, FileState>();
  private inFlight = new Map<string, Promise<boolean>>();

  /** Number of transcripts currently tracked. */
  get size(): number {
    return this.files.size;
  }

  /** Every file's entries, in no particular order. */
  entryLists(): UsageEntry[][] {
    return [...this.files.values()].map((f) => f.entries);
  }

  /**
   * Brings the store in line with a full directory listing: drops files that
   * are gone, reads new and grown ones. Resolves true if any entry changed.
   */
  async sync(refs: TranscriptRef[]): Promise<boolean> {
    let changed = false;
    const keep = new Set(refs.map((r) => r.path));
    for (const p of this.files.keys()) {
      if (!keep.has(p)) {
        this.files.delete(p);
        changed = true;
      }
    }
    let next = 0;
    const worker = async (): Promise<void> => {
      while (next < refs.length) {
        const ref = refs[next++]!;
        if (await this.update(ref)) changed = true;
      }
    };
    await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, refs.length) }, worker));
    return changed;
  }

  /**
   * Re-reads one transcript (new bytes only, when it grew). A file that can no
   * longer be read is dropped. Resolves true if its entries changed.
   */
  update(ref: TranscriptRef): Promise<boolean> {
    // One read per file at a time: a watcher tick and a full rescan reading
    // the same file from the same offset would parse its new lines twice.
    const prev = this.inFlight.get(ref.path) ?? Promise.resolve(false);
    const run = prev.then(() => this.read(ref));
    const settled = run.catch(() => false);
    this.inFlight.set(ref.path, settled);
    void settled.then(() => {
      if (this.inFlight.get(ref.path) === settled) this.inFlight.delete(ref.path);
    });
    return run;
  }

  private async read(ref: TranscriptRef): Promise<boolean> {
    let handle: fs.FileHandle;
    try {
      handle = await fs.open(ref.path, 'r');
    } catch {
      return this.files.delete(ref.path);
    }
    try {
      const st = await handle.stat();
      let state = this.files.get(ref.path);
      if (state && state.mtimeMs === st.mtimeMs && state.size === st.size) return false;

      let changed = false;
      if (!state || st.size < state.offset) {
        changed = state !== undefined && state.entries.length > 0;
        state = {
          ctx: { projectSlug: ref.projectSlug, projectPath: ref.projectPath },
          parser: createTranscriptParser(ref),
          entries: [],
          offset: 0,
          mtimeMs: 0,
          size: 0,
        };
        this.files.set(ref.path, state);
      }
      const added = await readNewLines(handle, state, st.size);
      state.mtimeMs = st.mtimeMs;
      state.size = st.size;
      return changed || added > 0;
    } catch {
      return false;
    } finally {
      await handle.close().catch(() => {});
    }
  }
}

/**
 * Reads `[state.offset, size)` in chunks, feeding complete lines to the
 * file's parser and advancing the offset past each one. A trailing line with
 * no newline yet is consumed only if it is already valid JSON; a half-written
 * one is left for the next read. Returns how many entries were added.
 */
async function readNewLines(
  handle: fs.FileHandle,
  state: FileState,
  size: number,
): Promise<number> {
  const before = state.entries.length;
  const push = (line: string): void => {
    const entry = state.parser.line(line);
    if (entry) state.entries.push(entry);
  };
  let pos = state.offset;
  /** Bytes of a line that started in an earlier chunk. */
  let carry: Buffer[] = [];
  const buf = Buffer.allocUnsafe(Math.min(CHUNK_BYTES, Math.max(1, size - pos)));
  while (pos < size) {
    const { bytesRead } = await handle.read(buf, 0, Math.min(buf.length, size - pos), pos);
    if (bytesRead === 0) break;
    const chunk = buf.subarray(0, bytesRead);
    let start = 0;
    let nl = chunk.indexOf(NEWLINE, start);
    while (nl !== -1) {
      const piece = chunk.subarray(start, nl);
      const line =
        carry.length > 0
          ? Buffer.concat([...carry, piece]).toString('utf8')
          : piece.toString('utf8');
      carry = [];
      push(line);
      start = nl + 1;
      nl = chunk.indexOf(NEWLINE, start);
    }
    if (start < chunk.length) carry.push(Buffer.from(chunk.subarray(start)));
    pos += bytesRead;
    state.offset = pos - carry.reduce((n, b) => n + b.length, 0);
  }
  if (carry.length > 0) {
    // No newline at the end of the file: keep the line only if it's whole.
    const tail = Buffer.concat(carry);
    const text = tail.toString('utf8');
    if (isCompleteJson(text)) {
      push(text);
      state.offset += tail.length;
    }
  }
  return state.entries.length - before;
}

function isCompleteJson(text: string): boolean {
  const t = text.trim();
  if (!t.startsWith('{')) return false;
  try {
    JSON.parse(t);
    return true;
  } catch {
    return false;
  }
}
