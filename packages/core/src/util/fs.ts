import { promises as fs, type Dirent } from 'node:fs';
import path from 'node:path';

/** Returns true if a path exists (file or directory). */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Reads a UTF-8 file, returning null on any error (missing, permission, etc.). */
export async function readFileSafe(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

/** Reads and parses a JSON file, returning null on any error. */
export async function readJsonSafe<T>(p: string): Promise<T | null> {
  const raw = await readFileSafe(p);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export interface WalkedFile {
  path: string;
  /** Path of the top-level directory under `root` this file lives in. */
  topDir: string;
  mtimeMs: number;
  size: number;
}

/**
 * Recursively collects files under `root` matching `match`. Symlinks are not
 * followed. Unreadable directories are skipped silently.
 */
export async function walkFiles(
  root: string,
  match: (filePath: string) => boolean,
): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];

  async function walk(dir: string, slug: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      // A file's project slug is the name of the top-level directory under `root`.
      const childSlug = dir === root ? entry.name : slug;
      if (entry.isDirectory()) {
        await walk(full, childSlug);
      } else if (entry.isFile() && match(full)) {
        try {
          const st = await fs.stat(full);
          out.push({ path: full, topDir: slug, mtimeMs: st.mtimeMs, size: st.size });
        } catch {
          // ignore files that vanish between readdir and stat
        }
      }
    }
  }

  await walk(root, '');
  return out;
}
