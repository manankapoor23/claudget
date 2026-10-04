import { promises as fs } from 'node:fs';
import { createTranscriptParser, type ParseContext, type TranscriptParser } from './parse';
import type { UsageEntry } from './types';

/** Bytes read per chunk (pooled). Longer lines are stitched across chunks. */
const CHUNK_BYTES = 256 * 1024;
/** Transcripts parsed at once during a full scan. */
const SCAN_CONCURRENCY = 2;
const NEWLINE = 0x0a;
/** Lines longer than this are scanned, not buffered (see readNewLines). */
const BIG_LINE_BYTES = 64 * 1024;
/** Bytes from each end of a skipped line searched for cwd / git branch. */
const SKIM_BYTES = 8 * 1024;

interface FileState {
  ctx: ParseContext;
  parser: TranscriptParser;
  entries: UsageEntry[];
  /** Bytes consumed so far: always the end of a complete line. */
  offset: number;
  /** stat at the last read, to skip files that haven't changed. */
  mtimeMs: number;
  size: number;
  /** Inode at the last read: a new one means the file was replaced, not appended to. */
  ino: number;
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
 * - a file is streamed in 256 KB chunks, so at most one chunk and one short
 *   line per file are in memory, never the file;
 * - a huge line (pasted image, long tool output: ~1% of lines, ~70% of the
 *   bytes) is only scanned for the markers that say it can matter, and read
 *   back and parsed only if it can;
 * - a shrunk or replaced file (truncated, or a new inode at the same path) is
 *   parsed again from the start.
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
      if (state && state.ino === st.ino && state.mtimeMs === st.mtimeMs && state.size === st.size) {
        return false;
      }

      let changed = false;
      // Shorter than what was read, or a different file at the same path (an
      // atomic rewrite): the old offset means nothing in it, start over.
      if (!state || st.size < state.offset || st.ino !== state.ino) {
        changed = state !== undefined && state.entries.length > 0;
        state = {
          ctx: { projectSlug: ref.projectSlug, projectPath: ref.projectPath },
          parser: createTranscriptParser(ref),
          entries: [],
          offset: 0,
          mtimeMs: 0,
          size: 0,
          ino: st.ino,
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
 *
 * Lines up to BIG_LINE_BYTES are assembled in memory. A longer one (a pasted
 * image, a long tool result) is only scanned as it streams past, for the
 * markers that say whether it can matter; it is read back in one piece only
 * if it can, which is a handful of lines in a whole history.
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
  const readRange = async (start: number, end: number): Promise<Buffer> => {
    const out = Buffer.allocUnsafe(Math.max(0, end - start));
    let got = 0;
    while (got < out.length) {
      const { bytesRead } = await handle.read(out, got, out.length - got, start + got);
      if (bytesRead === 0) break;
      got += bytesRead;
    }
    return out.subarray(0, got);
  };

  let pos = state.offset;
  /** The current, unfinished line's bytes (short lines only). */
  let carry: Buffer[] = [];
  let carryLen = 0;
  /** Set once the current line outgrows BIG_LINE_BYTES. */
  let long: LongLine | null = null;

  const finishLong = async (line: LongLine, end: number): Promise<void> => {
    if (line.usage || (line.user && state.parser.wantsTitle())) {
      push((await readRange(state.offset, end)).toString('utf8'));
    } else {
      const head = await readRange(state.offset, state.offset + SKIM_BYTES);
      const tail = await readRange(Math.max(state.offset, end - SKIM_BYTES), end);
      state.parser.skim(head.toString('utf8') + '\n' + tail.toString('utf8'));
    }
  };

  const buf = takeBuffer();
  try {
    while (pos < size) {
      const { bytesRead } = await handle.read(buf, 0, Math.min(buf.length, size - pos), pos);
      if (bytesRead === 0) break;
      const chunk = buf.subarray(0, bytesRead);
      let start = 0;
      for (;;) {
        const nl = chunk.indexOf(NEWLINE, start);
        const piece = chunk.subarray(start, nl === -1 ? chunk.length : nl);
        if (!long && carryLen + piece.length > BIG_LINE_BYTES) {
          long = { usage: false, user: false, edge: Buffer.alloc(0) };
          for (const part of carry) scanLong(long, part);
          carry = [];
          carryLen = 0;
        }
        if (long) scanLong(long, piece);
        if (nl === -1) {
          if (!long && piece.length > 0) {
            carry.push(Buffer.from(piece));
            carryLen += piece.length;
          }
          break;
        }
        const lineEnd = pos + nl;
        if (long) {
          await finishLong(long, lineEnd);
          long = null;
        } else {
          const line = carry.length > 0 ? Buffer.concat([...carry, piece]) : piece;
          push(line.toString('utf8'));
          carry = [];
          carryLen = 0;
        }
        state.offset = lineEnd + 1;
        start = nl + 1;
      }
      pos += bytesRead;
    }
  } finally {
    chunkPool.push(buf);
  }

  if (pos > state.offset) {
    // No newline at the end of the file: keep the line only if it's whole.
    const tail = long ? await readRange(state.offset, pos) : Buffer.concat(carry);
    const text = tail.toString('utf8');
    if (isCompleteJson(text)) {
      push(text);
      state.offset += tail.length;
    }
  }
  return state.entries.length - before;
}

interface LongLine {
  usage: boolean;
  user: boolean;
  /** The last few bytes seen, so a marker split across two chunks is found. */
  edge: Buffer;
}

const USAGE = Buffer.from('"usage"');
const USER_TYPE = Buffer.from('"type":"user"');
const EDGE_BYTES = USER_TYPE.length;

function scanLong(line: LongLine, bytes: Buffer): void {
  if (bytes.length === 0) return;
  const seam = Buffer.concat([line.edge, bytes.subarray(0, EDGE_BYTES)]);
  line.usage ||= bytes.indexOf(USAGE) !== -1 || seam.indexOf(USAGE) !== -1;
  line.user ||= bytes.indexOf(USER_TYPE) !== -1 || seam.indexOf(USER_TYPE) !== -1;
  const joined = bytes.length >= EDGE_BYTES ? bytes : Buffer.concat([line.edge, bytes]);
  line.edge = Buffer.from(joined.subarray(Math.max(0, joined.length - EDGE_BYTES)));
}

/**
 * Read buffers are reused across files rather than allocated per read: in
 * Electron, freed native memory tends to stay in the process footprint.
 */
const chunkPool: Buffer[] = [];
function takeBuffer(): Buffer {
  return chunkPool.pop() ?? Buffer.allocUnsafeSlow(CHUNK_BYTES);
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
