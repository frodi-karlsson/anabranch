/**
 * File Store Demo
 *
 * Demonstrates object storage operations with anabranch primitives:
 * - Upload files with Source.tap() for logging
 * - Process operations concurrently with .withConcurrency()
 * - Handle transient failures with retry and collect errors separately
 * - Use Source.partition() to separate successes from errors
 *
 * ## Run
 *
 * ```
 * deno run -A examples/file-store/main.ts
 * ```
 */

import { Source } from "@anabranch/anabranch";
import { createMemory, Storage } from "../../index.ts";
import type { StorageEntry } from "../../index.ts";

async function main() {
  const connector = createMemory({ prefix: "files/" });

  console.log("=== File Store Demo ===\n");

  try {
    const storage = await Storage.connect(connector).run();

    const files = [
      {
        filename: "report.pdf",
        content: "PDF content here",
        contentType: "application/pdf",
      },
      { filename: "image.png", content: PNG_DATA, contentType: "image/png" },
      {
        filename: "data.json",
        content: '{"users": []}',
        contentType: "application/json",
      },
      {
        filename: "readme.txt",
        content: "Hello, World!",
        contentType: "text/plain",
      },
    ];

    console.log(`Uploading ${files.length} files...\n`);

    await Source.from<UploadedFile, never>(async function* () {
      for (const file of files) yield file;
    })
      .tap((file) =>
        storage.put(file.filename, file.content, {
          contentType: file.contentType,
        }).run()
      )
      .tap((file) => console.log(`  Uploaded: ${file.filename}`))
      .collect();

    console.log("\nListing files...\n");

    const { successes: entries } = await storage.list("")
      .tap((entry: StorageEntry) =>
        console.log(`  - ${entry.key} (${entry.size} bytes)`)
      )
      .partition();

    console.log(`\nFound ${entries.length} files`);

    console.log("\nFetching metadata and content concurrently...\n");

    await Source.from<UploadedFile, never>(
      async function* () {
        for (const file of files) yield file;
      },
    )
      .withConcurrency(3)
      .map(async (file) => {
        const metadata = await storage.head(file.filename)
          .retry({ attempts: 3, delay: (attempt) => 10 * attempt })
          .timeout(5000)
          .run();
        const object = await storage.get(file.filename).run();
        const text = await new Response(object.body).text();
        return { filename: file.filename, metadata, text };
      })
      .tap(({ filename, metadata, text }) =>
        console.log(
          `  ${filename}: ${metadata.contentType}, ${metadata.size} bytes - "${
            text.substring(0, 20)
          }..."`,
        )
      )
      .collect();

    console.log("\n--- Cleanup ---\n");

    await Source.from<UploadedFile, never>(async function* () {
      for (const file of files) yield file;
    })
      .tap((file) => storage.delete(file.filename).run())
      .tap((file) => console.log(`  Deleted: ${file.filename}`))
      .collect();

    const { successes: remaining } = await storage.list("").partition();
    console.log(`\nRemaining files: ${remaining.length}`);
  } finally {
    await connector.end();
    console.log("\nConnector ended.");
  }
}

const PNG_DATA = "fake-png-data".repeat(200);

main().catch(console.error);

interface UploadedFile {
  filename: string;
  content: string;
  contentType: string;
}
