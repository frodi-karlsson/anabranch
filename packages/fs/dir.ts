import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Source } from "@anabranch/anabranch";
import { _matchGlob } from "./glob_match.ts";
import type { DirEntry, GlobOptions, WalkEntry, WalkOptions } from "./types.ts";
import {
  nodeErrorToFSError,
  type NotDirectory,
  type NotFound,
  type PermissionDenied,
  type Unknown,
} from "./errors.ts";

/**
 * Lists the immediate children of a directory.
 */
export function readDir(path: string | URL): Source<DirEntry, DirError> {
  return Source.from<DirEntry, DirError>(async function* () {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        yield {
          name: entry.name,
          isFile: entry.isFile(),
          isDirectory: entry.isDirectory(),
          isSymlink: entry.isSymbolicLink(),
        };
      }
    } catch (error) {
      throw nodeErrorToFSError(error, path);
    }
  });
}

/**
 * Recursively walks a directory tree, yielding each entry.
 */
export function walk(
  root: string | URL,
  options?: WalkOptions,
): Source<WalkEntry, DirError> {
  return Source.from<WalkEntry, DirError>(async function* () {
    const rootPath = root instanceof URL ? fileURLToPath(root) : root;
    const maxDepth = options?.maxDepth ?? Infinity;
    const includeFiles = options?.includeFiles ?? true;
    const includeDirs = options?.includeDirs ?? true;
    const includeSymlinks = options?.includeSymlinks ?? true;
    const match = options?.match;
    const skip = options?.skip;

    const stack: Array<[string, number]> = [[rootPath, 0]];

    while (stack.length > 0) {
      const [dirPath, depth] = stack.pop()!;
      let entries: Array<{
        name: string;
        isFile: () => boolean;
        isDirectory: () => boolean;
        isSymbolicLink: () => boolean;
      }>;

      try {
        entries = await readdir(dirPath, { withFileTypes: true });
      } catch (error) {
        throw nodeErrorToFSError(error, dirPath);
      }

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);
        const relPath = relative(rootPath, entryPath).replace(/\\/g, "/");
        const isFile = entry.isFile();
        const isDirectory = entry.isDirectory();
        const isSymlink = entry.isSymbolicLink();

        if (skip && skip.some((r) => r.test(relPath))) continue;

        const matchesFilter = !match || match.some((r) => r.test(relPath));

        const walkEntry: WalkEntry = {
          name: entry.name,
          path: entryPath,
          isFile,
          isDirectory,
          isSymlink,
        };

        if (isFile && includeFiles && matchesFilter) {
          yield walkEntry;
        } else if (isDirectory) {
          if (includeDirs && matchesFilter) {
            yield walkEntry;
          }
          if (depth < maxDepth) {
            stack.push([entryPath, depth + 1]);
          }
        } else if (isSymlink && includeSymlinks && matchesFilter) {
          yield walkEntry;
        }
      }
    }
  });
}

/**
 * Finds all entries under `root` whose relative path matches the glob `pattern`.
 */
export function glob(
  root: string | URL,
  pattern: string,
  options?: GlobOptions,
): Source<WalkEntry, DirError> {
  const regex = _matchGlob(pattern);
  return walk(root, { ...options, match: [regex] });
}

export type DirError = NotFound | NotDirectory | PermissionDenied | Unknown;
