/**
 * NoSQL Document Collection Demo
 *
 * Demonstrates document operations with anabranch primitives:
 * - Create collections with typed documents
 * - CRUD operations with Task semantics
 * - Query filtering with predicates
 * - Stream large result sets with .withConcurrency()
 * - Handle errors with proper typed error types
 *
 * Run:
 * ```
 * deno run -A packages/nosql/examples/main.ts
 * ```
 */

import { Collection, createInMemory, Source, Task } from '../index.ts'

main().catch(console.error)

async function main() {
  console.log('=== NoSQL Document Demo ===\n')

  const connector = createInMemory<User, string>()
  const users = await Collection.connect(connector, 'users').run()

  await seedUsers(users)
  await queryUsers(users)
  await streamUsers(users)

  console.log('\n--- Cleanup ---\n')
  await connector.end()
  console.log('Done!')
}

interface User {
  name: string
  email: string
  status: 'active' | 'pending' | 'inactive'
  createdAt: Date
}

const seedUsers = async (
  users: Collection<User, (u: User) => boolean, string>,
) => {
  console.log('Seeding users...\n')

  await Task.chain([
    () =>
      users.put('user-1', {
        name: 'Alice',
        email: 'alice@example.com',
        status: 'active',
        createdAt: new Date('2024-01-15'),
      }).tap(() => console.log('  Created: Alice (user-1)')),

    () =>
      users.put('user-2', {
        name: 'Bob',
        email: 'bob@example.com',
        status: 'pending',
        createdAt: new Date('2024-02-20'),
      }).tap(() => console.log('  Created: Bob (user-2)')),

    () =>
      users.put('user-3', {
        name: 'Carol',
        email: 'carol@example.com',
        status: 'active',
        createdAt: new Date('2024-03-10'),
      }).tap(() => console.log('  Created: Carol (user-3)')),

    () =>
      users.putMany([
        {
          key: 'user-4',
          doc: {
            name: 'Dave',
            email: 'dave@example.com',
            status: 'inactive',
            createdAt: new Date(),
          },
        },
        {
          key: 'user-5',
          doc: {
            name: 'Eve',
            email: 'eve@example.com',
            status: 'active',
            createdAt: new Date(),
          },
        },
      ]).tap(() => console.log('  Created: Dave, Eve (batch)')),
  ]).run()
}

const queryUsers = async (
  users: Collection<User, (u: User) => boolean, string>,
) => {
  console.log('\n--- Querying Users ---\n')

  console.log('Active users:')
  await users
    .find((u) => u.status === 'active')
    .map((u) => u.name)
    .tap((u) => console.log(`  - ${u}`))
    .collect()

  console.log('\nFetching single user:')
  await users.get('user-2')
    .tap((u) => {
      if (u) console.log(`  Found: ${u?.name} with status ${u?.status}`)
    })
    .run()

  console.log('\nUpdating user status:')
  await Task.chain([
    () =>
      users.put('user-2', {
        name: 'Bob',
        email: 'bob@example.com',
        status: 'active',
        createdAt: new Date('2024-02-20'),
      }),
    () =>
      users.get('user-2').tap((u) =>
        console.log(`  Updated Bob's status to: ${u?.status}`)
      ),
  ]).run()
}

const streamUsers = async (
  users: Collection<User, (u: User) => boolean, string>,
) => {
  console.log('\n--- Streaming with Concurrency ---\n')

  const { successes: processedUsers } = await users
    .find(() => true)
    .withConcurrency(2)
    .zip(Source.fromRange(1, Infinity))
    .map(async ([user, i]) => {
      await new Promise<void>((resolve, reject) =>
        setTimeout(
          () =>
            i % 3 === 0
              ? reject(new Error('Simulated processing error'))
              : resolve(),
          100,
        )
      )
      return user.name
    })
    .tapErr((err) => console.error('  Error processing user:', err.message))
    .tap((name) => console.log(`  Processed: ${name}`))
    .partition()

  console.log(`Processed ${processedUsers.length} users successfully`)

  console.log('\nDeleting user:')
  await users.delete('user-4').run()
  console.log('  Deleted: Dave (user-4)')

  const remaining = await users.find(() => true).partition()
  console.log(`\nRemaining users: ${remaining.successes.length}`)
}
