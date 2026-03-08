# @anabranch/storage-browser

Browser storage adapter for @anabranch/storage using IndexedDB.

## Usage

```ts
import { createIndexedDB } from "@anabranch/storage-browser";
import { Storage } from "@anabranch/storage";

const connector = createIndexedDB({ prefix: "app/" });
const storage = await Storage.connect(connector).run();

// Store data (Uint8Array, string, or ReadableStream)
await storage.put("config.json", JSON.stringify({ theme: "dark" })).run();
await storage.put("avatar.png", avatarBytes).run();

// Retrieve data
const { body, metadata } = await storage.get("config.json").run();
const config = JSON.parse(await new Response(body).text());

// List with prefix
const { successes } = await storage.list("avatars/").partition();

// Get metadata without body
const info = await storage.head("config.json").run();

// Delete
await storage.delete("old-file.txt").run();
```

## Installation

**Deno (JSR)**

```ts
import { createIndexedDB } from "jsr:@anabranch/storage-browser";
```

**npm**

```sh
npm install @anabranch/storage-browser
```

## Compatibility

- Works in browsers (Chrome, Firefox, Safari, Edge)
- Works in Web Workers
- Does not work in non-browser environments (Node.js, Deno CLI)
