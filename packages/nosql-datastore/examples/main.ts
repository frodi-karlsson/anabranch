/**
 * User Store Demo
 *
 * Demonstrates Google Cloud Datastore operations with anabranch primitives:
 * - Create users with unique emails using putMany
 * - Query users by status with filters
 * - Process users concurrently with .withConcurrency()
 * - Handle failures and collect errors separately
 * - Use Source.partition() to separate successes from errors
 *
 * You should see users being created, queried by status, processed concurrently,
 * and finally cleanup with the datastore being cleared.
 *
 * ## Run with Emulator
 *
 * Start the emulator in one terminal:
 * ```
docker run -d --name datastore-emulator -p 8090:8090 \
  google/cloud-sdk:emulators gcloud beta emulators datastore start \
  --host-port=0.0.0.0:8090 --project=test-project
 * ```
 *
 * Then run the example:
 * ```
DATASTORE_EMULATOR_HOST=localhost:8090 DATASTORE_PROJECT_ID=test-project \
  deno run -A packages/nosql-datastore/examples/main.ts
 * ```
 *
 * Cleanup when done:
 * ```
docker rm -f datastore-emulator
 * ```
 */

await main()

import { Source } from '@anabranch/anabranch'
import { createDatastore, PropertyFilter } from '../index.ts'
import { Collection } from '@anabranch/nosql'

async function main() {
  const projectId = Deno.env.get('DATASTORE_PROJECT_ID') || 'test-project'
  const emulatorHost = Deno.env.get('DATASTORE_EMULATOR_HOST')
  const apiEndpoint = emulatorHost ? `http://${emulatorHost}` : undefined

  console.log('=== User Store Demo ===\n')
  console.log(`Project: ${projectId}`)
  console.log(`Emulator: ${emulatorHost ? 'yes' : 'no'}\n`)

  const connector = createDatastore<User>({
    projectId,
    apiEndpoint,
    kind: 'User',
  })

  const store = await Collection.connect(connector, 'users').run()

  const users = [
    { email: 'alice@example.com', name: 'Alice', status: 'active' as const },
    { email: 'bob@example.com', name: 'Bob', status: 'active' as const },
    { email: 'carol@example.com', name: 'Carol', status: 'pending' as const },
    { email: 'dave@example.com', name: 'Dave', status: 'inactive' as const },
    { email: 'eve@example.com', name: 'Eve', status: 'active' as const },
    { email: 'frank@example.com', name: 'Frank', status: 'pending' as const },
  ]

  console.log(`Creating ${users.length} users with batch insert...\n`)

  const entries = users.map((user) => ({
    // We use ancestor keys to bypass eventual consistency for this demo
    key: ['Tenant', 'tenantA', 'User', user.email],
    doc: { ...user, _key: user.email },
  }))
  await store.putMany(entries).run()

  console.log(`  Batch inserted users: ${users.map((u) => u.name).join(', ')}`)

  console.log('\nQuerying active users...\n')
  const activeUsers = await store
    .find((q, keyGen) =>
      q.hasAncestor(keyGen(['Tenant', 'tenantA'])).filter(
        new PropertyFilter('status', '=', 'active'),
      )
    )
    .map((u) => u.name)
    .collect()
  console.log(`  Active: ${activeUsers.join(', ')}`)

  console.log('\nProcessing users concurrently...\n')
  const { successes, errors } = await store
    .find((q, keyGen) => q.hasAncestor(keyGen(['Tenant', 'tenantA'])))
    .withConcurrency(3)
    .map(async (user) => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return { ...user, processedAt: Date.now() }
    })
    .tap((user) => console.log(`  Processed: ${user.name}`))
    .partition()

  console.log(`\n  ${successes.length} succeeded, ${errors.length} failed`)

  console.log('\n--- Cleanup ---\n')

  await Source.fromArray(users)
    .tap((user) =>
      store.delete(['Tenant', 'tenantA', 'User', user.email]).run()
    )
    .tap((user) => console.log(`  Deleted: ${user.name}`))
    .collect()

  const remaining = await store.find((q, keyGen) =>
    q.hasAncestor(keyGen(['Tenant', 'tenantA']))
  ).collect()
  console.log(`\nRemaining users: ${remaining.length}`)
  await connector.end()
}

interface User {
  email: string
  name: string
  status: 'active' | 'pending' | 'inactive'
  _key: string
}
