# @anabranch/cache

Cache primitives with Task semantics for composable error handling. Supports
TTL, cache-aside (`getOrSet`), and pluggable backends via the adapter pattern.

## Usage

```ts
import { Cache, createInMemory } from '@anabranch/cache'

const cache = await Cache.connect(createInMemory()).run()

// Basic set/get with TTL
await cache.set('session:abc', { userId: 123 }, { ttl: 3600_000 }).run()
const session = await cache.get<{ userId: number }>('session:abc').run()

// Cache-aside: compute on miss, store with TTL
const user = await cache
  .getOrSet('user:1', () => fetchUserFromDB(1), { ttl: 60_000 })
  .run()

// Check existence
if (await cache.has('session:abc').run()) {
  console.log('Session exists')
}

// Delete
await cache.delete('session:abc').run()
```

## Installation

**Deno (JSR)**

```ts
import { Cache, createInMemory } from 'jsr:@anabranch/cache'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/cache
```

## API reference

See [generated documentation](https://frodi-karlsson.github.io/anabranch/cache)
for full API details.
