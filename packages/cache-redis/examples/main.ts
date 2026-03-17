/**
 * cache-redis Example — Session cache with TTL and cache-aside.
 *
 * Requires a running Redis instance.
 *
 * Run:
 * ```
 * REDIS_URL=redis://localhost:6379 deno run -A packages/cache-redis/examples/main.ts
 * ```
 */

import { Cache } from '@anabranch/cache'
import { createRedisCache } from '../index.ts'

interface Session {
  userId: number
  role: string
  createdAt: number
}

async function main() {
  const url = Deno.env.get('REDIS_URL') ?? 'redis://localhost:6379'
  const connector = createRedisCache({ connection: url, prefix: 'example' })
  const cache = await Cache.connect(connector).run()

  console.log('=== Session Cache ===\n')

  const sessionId = crypto.randomUUID()

  // Store a session with 5s TTL
  const session: Session = {
    userId: 42,
    role: 'admin',
    createdAt: Date.now(),
  }
  await cache.set(`session:${sessionId}`, session, { ttl: 5_000 }).run()
  console.log(`Stored session ${sessionId} with 5s TTL`)

  // Retrieve it
  const retrieved = await cache.get<Session>(`session:${sessionId}`).run()
  console.log(`Retrieved: userId=${retrieved?.userId}, role=${retrieved?.role}`)

  console.log('\n=== Cache-Aside ===\n')

  // Simulate expensive user lookup
  let dbCalls = 0
  const user = await cache.getOrSet(
    'user:42',
    () => {
      dbCalls++
      console.log('  [DB] Fetching user 42...')
      return { id: 42, name: 'Alice', email: 'alice@example.com' }
    },
    { ttl: 10_000 },
  ).run()
  console.log(`Got user: ${user.name} (${dbCalls} DB call)`)

  // Second call hits cache
  await cache.getOrSet('user:42', () => {
    dbCalls++
    return { id: 42, name: 'Alice', email: 'alice@example.com' }
  }).run()
  console.log(`Cache hit (still ${dbCalls} DB call)`)

  // Cleanup
  await cache.delete(`session:${sessionId}`).run()
  await cache.delete('user:42').run()
  await cache.close().run()
  await connector.end()
  console.log('\nDone.')
}

main().catch(console.error)
