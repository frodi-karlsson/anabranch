import { createReadStream } from 'node:fs'
import { readFile as fsReadFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { Source, Task } from '@anabranch/anabranch'
import {
  InvalidData,
  nodeErrorToFSError,
  type NotFound,
  type PermissionDenied,
  type ReadError,
  type Unknown,
} from './errors.ts'

/**
 * Streams lines from a text file one at a time using `node:readline`.
 */
export function readLines(path: string | URL): Source<string, ReadFileError> {
  return Source.from<string, ReadFileError>(async function* () {
    const stream = createReadStream(path)
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    try {
      for await (const line of rl) {
        yield line
      }
    } catch (error) {
      throw nodeErrorToFSError(error, path)
    } finally {
      rl.close()
      stream.destroy()
    }
  })
}

/**
 * Reads an entire file as a UTF-8 string.
 */
export function readTextFile(
  path: string | URL,
): Task<string, ReadFileError> {
  return Task.of(async () => await fsReadFile(path, 'utf8'))
    .mapErr((error) => nodeErrorToFSError(error, path) as ReadFileError)
}

/**
 * Reads an entire file as a `Uint8Array`.
 */
export function readFile(
  path: string | URL,
): Task<Uint8Array, ReadFileError> {
  return Task.of(async () => {
    const buf = await fsReadFile(path)
    return new Uint8Array(buf)
  }).mapErr((error) => nodeErrorToFSError(error, path) as ReadFileError)
}

/**
 * Reads a JSON file and parses it, returning the value typed as `T`.
 */
// deno-lint-ignore no-explicit-any
export function readJson<T extends Record<string, any> = Record<string, any>>(
  path: string | URL,
): Task<T, ReadJsonError> {
  return Task.of<string, ReadFileError>(async () =>
    await fsReadFile(path, 'utf8')
  )
    .mapErr((error) => nodeErrorToFSError(error, path) as ReadFileError)
    .map<T, ReadJsonError>((text) => {
      try {
        return JSON.parse(text) as T
      } catch (error) {
        throw new InvalidData(
          path,
          (error as Error).message,
          error,
        )
      }
    })
}

/** Errors that can occur when reading files. */
export type ReadFileError = NotFound | PermissionDenied | ReadError | Unknown

/** Errors that can occur when reading JSON files. */
export type ReadJsonError =
  | NotFound
  | PermissionDenied
  | ReadError
  | InstanceType<typeof InvalidData>
  | Unknown
