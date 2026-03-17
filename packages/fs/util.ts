import {
  access,
  copyFile as fsCopyFile,
  lstat,
  mkdir,
  rm,
} from 'node:fs/promises'
import { Task } from '@anabranch/anabranch'
import {
  nodeErrorToFSError,
  type NotFound,
  type PermissionDenied,
  type Unknown,
} from './errors.ts'
import type { StatInfo } from './types.ts'

/**
 * Checks whether a path exists.
 *
 * @example
 * ```ts
 * if (await exists("./config.json").run()) {
 *   // file exists
 * }
 * ```
 */
export function exists(path: string | URL): Task<boolean, ExistsError> {
  return Task.of<boolean, ExistsError>(async () => {
    try {
      await access(path)
      return true
    } catch (error) {
      const fsError = nodeErrorToFSError(error, path)
      if (fsError.kind === 'NotFound') return false
      throw fsError
    }
  })
}

/** Errors that can occur when checking existence. */
export type ExistsError = PermissionDenied | Unknown

/**
 * Creates a directory and any missing parents, like `mkdir -p`.
 *
 * @example
 * ```ts
 * await ensureDir("./data/cache/images").run();
 * ```
 */
export function ensureDir(path: string | URL): Task<void, EnsureDirError> {
  return Task.of<void, EnsureDirError>(async () => {
    await mkdir(path, { recursive: true })
  }).mapErr((error) => nodeErrorToFSError(error, path) as EnsureDirError)
}

/** Errors that can occur when ensuring a directory. */
export type EnsureDirError = PermissionDenied | Unknown

/**
 * Removes a file or directory recursively. No error if the path doesn't exist.
 *
 * @example
 * ```ts
 * await remove("./tmp").run();
 * ```
 */
export function remove(path: string | URL): Task<void, RemoveError> {
  return Task.of<void, RemoveError>(async () => {
    await rm(path, { recursive: true, force: true })
  }).mapErr((error) => nodeErrorToFSError(error, path) as RemoveError)
}

/** Errors that can occur when removing a path. */
export type RemoveError = PermissionDenied | Unknown

/**
 * Copies a single file from `src` to `dst`.
 *
 * @example
 * ```ts
 * await copyFile("./template.txt", "./output.txt").run();
 * ```
 */
export function copyFile(
  src: string | URL,
  dst: string | URL,
): Task<void, CopyFileError> {
  return Task.of<void, CopyFileError>(async () => {
    await fsCopyFile(src, dst)
  }).mapErr((error) => nodeErrorToFSError(error, src) as CopyFileError)
}

/** Errors that can occur when copying a file. */
export type CopyFileError = NotFound | PermissionDenied | Unknown

/**
 * Returns metadata for a path without reading its contents.
 *
 * @example
 * ```ts
 * const info = await stat("./data.csv").run();
 * console.log(info.size, info.mtime);
 * ```
 */
export function stat(path: string | URL): Task<StatInfo, StatError> {
  return Task.of<StatInfo, StatError>(async () => {
    const s = await lstat(path)
    return {
      size: s.size,
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
      isSymlink: s.isSymbolicLink(),
      mtime: s.mtimeMs ? new Date(s.mtimeMs) : s.mtime,
      atime: s.atimeMs ? new Date(s.atimeMs) : s.atime,
      birthtime: s.birthtimeMs ? new Date(s.birthtimeMs) : s.birthtime,
    }
  }).mapErr((error) => nodeErrorToFSError(error, path) as StatError)
}

/** Errors that can occur when stat-ing a path. */
export type StatError = NotFound | PermissionDenied | Unknown
