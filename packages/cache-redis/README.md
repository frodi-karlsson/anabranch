# @anabranch/cache-redis

Redis adapter for [@anabranch/cache](https://jsr.io/@anabranch/cache) using
ioredis. Values are JSON-serialized, TTL uses Redis native `PX` expiry.

## Usage

```ts
import { Cache } from '@anabranch/cache'
import { createRedisCache } from '@anabranch/cache-redis'

const cache = await Cache.connect(
  createRedisCache('redis://localhost:6379'),
).run()

await cache.set('user:1', { name: 'Alice' }, { ttl: 60_000 }).run()
const user = await cache.get<{ name: string }>('user:1').run()

// Cache-aside
const data = await cache
  .getOrSet('expensive', () => computeExpensive(), { ttl: 30_000 })
  .run()
```

## Installation

**Deno (JSR)**

```ts
import { createRedisCache } from 'jsr:@anabranch/cache-redis'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/cache-redis
```

## API reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/cache-redis)
for full API details.
