/**
 * Error thrown when a storage connection cannot be established.
 *
 * @example Handling connection failures with retry
 * ```ts
 * import { Storage, createInMemory, StorageConnectionFailed } from "@anabranch/storage";
 *
 * const storage = await Storage.connect(createInMemory())
 *   .retry({ attempts: 3, delay: 1000 })
 *   .timeout(30_000)
 *   .try();
 * ```
 */
export class StorageConnectionFailed extends Error {
  override name = 'StorageConnectionFailed'
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(`Storage connection failed: ${message}`, { cause })
  }
}

/**
 * Error thrown when attempting to get or head an object that does not exist.
 *
 * @example Handling not found errors
 * ```ts
 * import { Storage, createInMemory, StorageObjectNotFound } from "@anabranch/storage";
 *
 * try {
 *   const object = await storage.get("missing.txt").run();
 * } catch (error) {
 *   if (error instanceof StorageObjectNotFound) {
 *     console.log("Object does not exist");
 *   }
 * }
 * ```
 */
export class StorageObjectNotFound extends Error {
  override name = 'StorageObjectNotFound'
  constructor(key: string) {
    super(`Storage object not found: ${key}`)
  }
}

/**
 * Error thrown when closing a storage connection fails.
 */
export class StorageCloseFailed extends Error {
  override name = 'StorageCloseFailed'
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(`Storage close failed: ${message}`, { cause })
  }
}

/**
 * Error thrown when a put operation fails.
 */
export class StoragePutFailed extends Error {
  override name = 'StoragePutFailed'
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to put object ${key}: ${message}`, { cause })
  }
}

/**
 * Error thrown when a get operation fails.
 */
export class StorageGetFailed extends Error {
  override name = 'StorageGetFailed'
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to get object ${key}: ${message}`, { cause })
  }
}

/**
 * Error thrown when a delete operation fails.
 */
export class StorageDeleteFailed extends Error {
  override name = 'StorageDeleteFailed'
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to delete object ${key}: ${message}`, { cause })
  }
}

/**
 * Error thrown when a head operation fails.
 */
export class StorageHeadFailed extends Error {
  override name = 'StorageHeadFailed'
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to head object ${key}: ${message}`, { cause })
  }
}

/**
 * Error thrown when generating a presigned URL fails.
 */
export class StoragePresignFailed extends Error {
  override name = 'StoragePresignFailed'
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to presign object ${key}: ${message}`, { cause })
  }
}

/**
 * Error thrown when attempting to use presign on an adapter that does not
 * support presigned URLs.
 *
 * @example Checking for presign support
 * ```ts
 * import { Storage, createInMemory, StoragePresignNotSupported } from "@anabranch/storage";
 *
 * const storage = await Storage.connect(createInMemory()).run();
 *
 * try {
 *   const url = await storage.presign("file.txt", { expiresIn: 3600 }).run();
 *   console.log(url);
 * } catch (error) {
 *   if (error instanceof StoragePresignNotSupported) {
 *     console.log("Presigned URLs not supported by this adapter");
 *   }
 * }
 * ```
 */
export class StoragePresignNotSupported extends Error {
  override name = 'StoragePresignNotSupported'
  constructor() {
    super('Presigned URLs are not supported by this storage adapter.')
  }
}

/**
 * Error thrown when a list operation fails.
 */
export class StorageListFailed extends Error {
  override name = 'StorageListFailed'
  constructor(
    prefix: string | undefined,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Failed to list objects${
        prefix ? ` with prefix "${prefix}"` : ''
      }: ${message}`,
      { cause },
    )
  }
}
