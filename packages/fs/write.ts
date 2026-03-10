import { writeFile as fsWriteFile } from 'node:fs/promises'
import { Task } from '@anabranch/anabranch'
import {
  type IsDirectory,
  nodeErrorToFSError,
  type NotFound,
  type PermissionDenied,
  type Unknown,
  type WriteError,
} from './errors.ts'

/**
 * Writes a UTF-8 string to a file, creating or overwriting it.
 */
export function writeTextFile(
  path: string | URL,
  content: string,
): Task<void, WriteFileError> {
  return Task.of<void, WriteFileError>(async () =>
    await fsWriteFile(path, content, 'utf8')
  )
    .mapErr((error) => nodeErrorToFSError(error, path) as WriteFileError)
}

/**
 * Writes a `Uint8Array` to a file, creating or overwriting it.
 */
export function writeFile(
  path: string | URL,
  data: Uint8Array,
): Task<void, WriteFileError> {
  return Task.of<void, WriteFileError>(async () =>
    await fsWriteFile(path, data)
  )
    .mapErr((error) => nodeErrorToFSError(error, path) as WriteFileError)
}

/**
 * Serialises `value` as JSON and writes it to a file, creating or overwriting it.
 */
export function writeJson(
  path: string | URL,
  value: unknown,
): Task<void, WriteFileError> {
  return Task.of<void, WriteFileError>(async () =>
    await fsWriteFile(path, JSON.stringify(value), 'utf8')
  )
    .mapErr((error) => nodeErrorToFSError(error, path) as WriteFileError)
}

/** Errors that can occur when writing files. */
export type WriteFileError =
  | NotFound
  | IsDirectory
  | PermissionDenied
  | WriteError
  | Unknown
