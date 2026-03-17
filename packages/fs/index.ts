/**
 * Streaming file-system utilities for the anabranch ecosystem.
 *
 * Multi-value operations return a {@link Source} so results can be streamed,
 * filtered, and transformed with the full anabranch API. Single-value
 * operations return a {@link Task} for composable error handling.
 *
 * @example Read all lines from a file
 * ```ts
 * import { readLines } from "@anabranch/fs";
 *
 * const { successes } = await readLines("./data.txt").partition();
 * console.log(successes.join("\n"));
 * ```
 *
 * @example Walk a directory and find TypeScript files
 * ```ts
 * import { glob } from "@anabranch/fs";
 *
 * const results = await glob("./src", "*.ts").collect();
 * console.log(results.map((e) => e.path));
 * ```
 *
 * @module
 */
export { readFile, readJson, readLines, readTextFile } from './read.ts'
export type { ReadFileError, ReadJsonError } from './read.ts'
export { writeFile, writeJson, writeTextFile } from './write.ts'
export type { WriteFileError } from './write.ts'
export { glob, readDir, walk } from './dir.ts'
export type { DirError } from './dir.ts'
export { watch } from './watch.ts'
export type { WatchError } from './watch.ts'
export { copyFile, ensureDir, exists, remove, stat } from './util.ts'
export type {
  CopyFileError,
  EnsureDirError,
  ExistsError,
  RemoveError,
  StatError,
} from './util.ts'
export type {
  DirEntry,
  FsEvent,
  GlobOptions,
  StatInfo,
  WalkEntry,
  WalkOptions,
  WatchOptions,
} from './types.ts'
export { FSError, nodeErrorToFSError } from './errors.ts'
export {
  AlreadyExists,
  InvalidData,
  IsDirectory,
  NotDirectory,
  NotFound,
  PermissionDenied,
  ReadError,
  Unknown,
  WriteError,
} from './errors.ts'
