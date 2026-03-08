import { existsSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Channel, Source } from "@anabranch/anabranch";
import type { Stream } from "@anabranch/anabranch";
import type { FsEvent, WatchOptions } from "./types.ts";
import {
  nodeErrorToFSError,
  type NotFound,
  type PermissionDenied,
} from "./errors.ts";

/** Errors that can occur when watching the file system. */
export type WatchError = NotFound | PermissionDenied;

/**
 * Watches `path` for file-system changes, yielding a {@link FsEvent} for each.
 *
 * Uses a push-based queue internally so events are never dropped between yields.
 * Cancel the stream to stop watching (e.g. via `take`, breaking `for await`, or
 * returning from the generator).
 *
 * Note: on some platforms `rename` events cannot distinguish creation from
 * deletion without a stat check. This implementation infers the kind by
 * checking whether the file still exists at event time.
 */
export function watch(
  path: string | URL,
  options?: WatchOptions,
): Stream<FsEvent, WatchError> {
  const watchPath = path instanceof URL ? fileURLToPath(path) : path;

  return Source.fromResults<FsEvent, WatchError>(async function* () {
    const watcher = fsWatch(
      path,
      { recursive: options?.recursive ?? true, persistent: false },
      (eventType, filename) => {
        const name = filename as string | null;
        const fullPath = name ? join(watchPath, name) : watchPath;
        let kind: "create" | "modify" | "remove";
        if (eventType === "rename") {
          kind = existsSync(fullPath) ? "create" : "remove";
        } else {
          kind = "modify";
        }
        channel.send({ kind, paths: [fullPath] });
      },
    );

    const channel = new Channel<FsEvent, WatchError>({
      onClose: () => watcher?.close(),
    });

    watcher.once(
      "error",
      (err) => channel.fail(nodeErrorToFSError(err, path)),
    );

    watcher.once("close", () => channel.close());

    yield* channel;
  });
}
