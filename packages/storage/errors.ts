export class StorageConnectionFailed extends Error {
  override name = "StorageConnectionFailed";
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(`Storage connection failed: ${message}`, { cause });
  }
}

export class StorageObjectNotFound extends Error {
  override name = "StorageObjectNotFound";
  constructor(key: string) {
    super(`Storage object not found: ${key}`);
  }
}

export class StorageCloseFailed extends Error {
  override name = "StorageCloseFailed";
  constructor(
    message: string,
    cause?: unknown,
  ) {
    super(`Storage close failed: ${message}`, { cause });
  }
}

export class StoragePutFailed extends Error {
  override name = "StoragePutFailed";
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to put object ${key}: ${message}`, { cause });
  }
}

export class StorageGetFailed extends Error {
  override name = "StorageGetFailed";
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to get object ${key}: ${message}`, { cause });
  }
}

export class StorageDeleteFailed extends Error {
  override name = "StorageDeleteFailed";
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to delete object ${key}: ${message}`, { cause });
  }
}

export class StorageHeadFailed extends Error {
  override name = "StorageHeadFailed";
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to head object ${key}: ${message}`, { cause });
  }
}

export class StoragePresignFailed extends Error {
  override name = "StoragePresignFailed";
  constructor(
    key: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Failed to presign object ${key}: ${message}`, { cause });
  }
}

export class StorageListFailed extends Error {
  override name = "StorageListFailed";
  constructor(
    prefix: string | undefined,
    message: string,
    cause?: unknown,
  ) {
    super(
      `Failed to list objects${
        prefix ? ` with prefix "${prefix}"` : ""
      }: ${message}`,
      { cause },
    );
  }
}
