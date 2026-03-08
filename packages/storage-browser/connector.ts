/// <reference lib="dom" />
import type {
  BodyInput,
  PutOptions,
  StorageAdapter,
  StorageConnector,
  StorageEntry,
  StorageMetadata,
  StorageOptions,
} from "@anabranch/storage";
import {
  StorageDeleteFailed,
  StorageGetFailed,
  StorageHeadFailed,
  StorageListFailed,
  StorageObjectNotFound,
  StoragePutFailed,
} from "@anabranch/storage";

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function createIndexedDB(
  options?: StorageOptions & { dbName?: string },
): StorageConnector {
  const prefix = options?.prefix ?? "";
  const dbName = options?.dbName ?? "anabranch-storage";
  const storeName = "objects";

  let dbRef: IDBDatabase | null = null;

  return {
    connect: (_signal?: AbortSignal) =>
      openDatabase(dbName, storeName).then((db) => {
        dbRef = db;
        return createAdapter(db, storeName, prefix);
      }),
    end: () =>
      dbRef
        ? new Promise<void>((resolve) => {
          dbRef!.close();
          dbRef = null;
          resolve();
        })
        : Promise.resolve(),
  };
}

function openDatabase(
  dbName: string,
  storeName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = () =>
      reject(new Error(`Failed to open IndexedDB: ${dbName}`));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: "key" });
      }
    };
  });
}

function createAdapter(
  db: IDBDatabase,
  storeName: string,
  prefix: string,
): StorageAdapter {
  return {
    put: async (
      key: string,
      body: BodyInput,
      options?: PutOptions,
    ) => {
      const fullKey = prefix + key;
      const bytes = body instanceof ReadableStream
        ? await readStream(body)
        : typeof body === "string"
        ? new TextEncoder().encode(body)
        : body;

      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);

      const record: IdbRecord = {
        key: fullKey,
        bytes,
        metadata: {
          key,
          size: bytes.length,
          lastModified: new Date(),
          contentType: options?.contentType,
          custom: options?.custom,
        },
      };

      try {
        await promisify(store.put(record));

        await new Promise<void>((resolve, reject) => {
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
        });
      } catch (error) {
        throw new StoragePutFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    },
    get: (key: string) => {
      const fullKey = prefix + key;
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);

      return new Promise((resolve, reject) => {
        const request = store.get(fullKey);
        request.onerror = () =>
          reject(
            new StorageGetFailed(
              key,
              request.error?.message || "Unknown error",
              request.error,
            ),
          );
        request.onsuccess = () => {
          if (!request.result) {
            reject(new StorageObjectNotFound(key));
          } else {
            const { bytes, metadata } = request.result;
            resolve({
              body: new ReadableStream({
                start(controller) {
                  controller.enqueue(bytes);
                  controller.close();
                },
              }),
              metadata: { ...metadata, key },
            });
          }
        };
      });
    },
    delete: (key: string) => {
      const fullKey = prefix + key;
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);

      try {
        return promisify(store.delete(fullKey)).then(() =>
          new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () =>
              reject(
                new StorageDeleteFailed(
                  key,
                  transaction.error?.message || "Unknown error",
                  transaction.error,
                ),
              );
          })
        );
      } catch (error) {
        throw new StorageDeleteFailed(
          key,
          error instanceof Error ? error.message : String(error),
          error,
        );
      }
    },
    head: (key: string) => {
      const fullKey = prefix + key;
      const transaction = db.transaction(storeName, "readonly");
      const store = transaction.objectStore(storeName);

      return new Promise((resolve, reject) => {
        const request = store.get(fullKey);
        request.onerror = () =>
          reject(
            new StorageHeadFailed(
              key,
              request.error?.message || "Unknown error",
              request.error,
            ),
          );
        request.onsuccess = () => {
          if (!request.result) {
            reject(new StorageObjectNotFound(key));
          } else {
            resolve({ ...request.result.metadata, key });
          }
        };
      });
    },
    list: (p?: string) => {
      const searchPrefix = prefix + (p ?? "");
      return (async function* (): AsyncGenerator<StorageEntry> {
        const transaction = db.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const range = IDBKeyRange.bound(
          searchPrefix,
          searchPrefix + "\uffff",
        );

        const items = await new Promise<StorageEntry[]>(
          (resolve, reject) => {
            const results: StorageEntry[] = [];
            const request = store.openCursor(range);

            request.onsuccess = () => {
              const cursor = request.result;
              if (cursor) {
                const { metadata, key: fullKey } = cursor.value as IdbRecord;
                const key = fullKey.slice(prefix.length);
                results.push({
                  key,
                  size: metadata.size,
                  lastModified: metadata.lastModified,
                });
                cursor.continue();
              } else {
                resolve(results);
              }
            };

            request.onerror = () => {
              reject(
                new StorageListFailed(
                  p,
                  request.error?.message || "Unknown error",
                  request.error,
                ),
              );
            };
          },
        );

        for (const item of items) {
          yield item;
        }
      })();
    },
    close: () => Promise.resolve(),
  };
}

async function readStream(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

interface IdbRecord {
  key: string;
  bytes: Uint8Array;
  metadata: StorageMetadata;
}
