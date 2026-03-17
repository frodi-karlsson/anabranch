/**
 * Cache Example — User profile service with cache-aside pattern.
 *
 * Simulates a service that caches user profiles from a slow database,
 * showing cache hits, misses, invalidation, and TTL expiry.
 *
 * Run:
 * ```
 * deno run -A packages/cache/examples/main.ts
 * ```
 */

import { Cache, createInMemory } from '../index.ts'

// Simulated database with artificial latency
const db = new Map([
  ['user:1', { id: 1, name: 'Alice', email: 'alice@example.com' }],
  ['user:2', { id: 2, name: 'Bob', email: 'bob@example.com' }],
  ['user:3', { id: 3, name: 'Charlie', email: 'charlie@example.com' }],
])

interface User {
  id: number
  name: string
  email: string
}

function fetchUser(id: number): User {
  console.log(`  [DB] Fetching user:${id} (slow)`)
  const user = db.get(`user:${id}`)
  if (!user) throw new Error(`User ${id} not found`)
  return user
}

async function main() {
  const cache = await Cache.connect(createInMemory()).run()

  console.log('=== Cache-Aside Pattern ===\n')

  // First request: cache miss, fetches from DB
  console.log('Request 1: Get user:1')
  const alice = await cache
    .getOrSet<User>('user:1', () => fetchUser(1), { ttl: 500 })
    .run()
  console.log(`  Result: ${alice.name} <${alice.email}>\n`)

  // Second request: cache hit, no DB call
  console.log('Request 2: Get user:1 again')
  const aliceCached = await cache
    .getOrSet<User>('user:1', () => fetchUser(1), { ttl: 500 })
    .run()
  console.log(`  Result: ${aliceCached.name} (from cache)\n`)

  // Different user: cache miss
  console.log('Request 3: Get user:2')
  const bob = await cache
    .getOrSet<User>('user:2', () => fetchUser(2), { ttl: 500 })
    .run()
  console.log(`  Result: ${bob.name} <${bob.email}>\n`)

  console.log('=== Cache Invalidation ===\n')

  // Simulate profile update: invalidate cache
  console.log('User:1 updates their email...')
  db.set('user:1', { id: 1, name: 'Alice', email: 'alice@newdomain.com' })
  await cache.delete('user:1').run()
  console.log('  Cache entry invalidated\n')

  // Next fetch picks up the new data
  console.log('Request 4: Get user:1 after update')
  const aliceUpdated = await cache
    .getOrSet<User>('user:1', () => fetchUser(1), { ttl: 500 })
    .run()
  console.log(`  Result: ${aliceUpdated.name} <${aliceUpdated.email}>\n`)

  console.log('=== TTL Expiry ===\n')

  console.log('Waiting 600ms for TTL to expire...')
  await new Promise((r) => setTimeout(r, 600))

  console.log('Request 5: Get user:2 after TTL expiry')
  const bobRefreshed = await cache
    .getOrSet<User>('user:2', () => fetchUser(2), { ttl: 500 })
    .run()
  console.log(`  Result: ${bobRefreshed.name} (re-fetched after expiry)\n`)

  await cache.close().run()
  console.log('Done.')
}

main().catch(console.error)
