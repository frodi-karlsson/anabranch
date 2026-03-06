/**
 * Structured error types for file-system operations.
 *
 * @example
 * ```ts
 * import { readTextFile, FSError, FSErrors } from "@anabranch/fs";
 *
 * const result = await readTextFile("./config.json").run();
 * if (result.type === "error") {
 *   const err = result.error;
 *   if (err instanceof FSError) {
 *     console.error(`${err.kind}: ${err.path} - ${err.message}`);
 *   }
 * }
 * ```
 */
export class FSError extends Error {
  readonly kind: string;
  readonly path: string | URL;

  constructor(kind: string, path: string | URL, message: string) {
    super(message);
    this.kind = kind;
    this.path = path;
  }
}

export class NotFound extends FSError {
  constructor(path: string | URL, message: string) {
    super("NotFound", path, message);
  }
}

/** File already exists when it should not. */
export class AlreadyExists extends FSError {
  constructor(path: string | URL, message: string) {
    super("AlreadyExists", path, message);
  }
}

/** Path is a directory when a file was expected. */
export class IsDirectory extends FSError {
  constructor(path: string | URL, message: string) {
    super("IsDirectory", path, message);
  }
}

/** Path is not a directory when a directory was expected. */
export class NotDirectory extends FSError {
  constructor(path: string | URL, message: string) {
    super("NotDirectory", path, message);
  }
}

/** Permission denied accessing the file system. */
export class PermissionDenied extends FSError {
  constructor(path: string | URL, message: string) {
    super("PermissionDenied", path, message);
  }
}

/** Error reading from the file system. */
export class ReadError extends FSError {
  constructor(path: string | URL, message: string) {
    super("ReadError", path, message);
  }
}

/** Error writing to the file system. */
export class WriteError extends FSError {
  constructor(path: string | URL, message: string) {
    super("WriteError", path, message);
  }
}

/** File content is invalid (e.g., malformed JSON). */
export class InvalidData extends FSError {
  override readonly cause?: unknown;

  constructor(path: string | URL, message: string, cause?: unknown) {
    super("InvalidData", path, message);
    this.cause = cause;
  }
}

/** Unknown file system error. */
export class Unknown extends FSError {
  override readonly cause?: unknown;

  constructor(path: string | URL, message: string, cause?: unknown) {
    super("Unknown", path, message);
    this.cause = cause;
  }
}

/** Registry of file-system error constructors for `instanceof` checks. */
export const FSErrors = {
  NotFound,
  AlreadyExists,
  IsDirectory,
  NotDirectory,
  PermissionDenied,
  ReadError,
  WriteError,
  InvalidData,
  Unknown,
} as const;

function nodeErrorToFSError(error: unknown, path: string | URL): FSError {
  const message = error instanceof Error ? error.message : String(error);
  const nodeError = error as { code?: string };

  switch (nodeError.code) {
    case "ENOENT":
      return new NotFound(path, message);
    case "EEXIST":
      return new AlreadyExists(path, message);
    case "EISDIR":
      return new IsDirectory(path, message);
    case "ENOTDIR":
      return new NotDirectory(path, message);
    case "EACCES":
    case "EPERM":
      return new PermissionDenied(path, message);
    default:
      return new Unknown(path, message, error);
  }
}

export { nodeErrorToFSError };
