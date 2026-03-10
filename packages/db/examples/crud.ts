/**
 * Database Demo
 *
 * Demonstrates database operations with anabranch primitives:
 * - Create schema with CREATE TABLE statements
 * - Insert data with transactional integrity using withTransaction()
 * - Query single records with error recovery
 * - Stream large result sets with .withConcurrency()
 * - Handle transient failures with retry and collect errors separately
 * - Use Source.partition() to separate successes from errors
 *
 * You should see schema creation, user posts being inserted with transactions,
 * concurrent post fetching with retry logic, and proper cleanup.
 *
 * ## Run
 *
 * ```
 * deno run -A packages/db/examples/crud.ts
 * ```
 */

import { Task } from '@anabranch/anabranch'
import {
  ConstraintViolation,
  createInMemory,
  DB,
  DBTransaction,
  QueryFailed,
} from '../index.ts'

main().catch(console.error)

async function main() {
  console.log('=== Database Demo ===\n')

  const connector = createInMemory()

  await DB.withConnection(
    connector,
    (db: DB) =>
      Task.chain([
        () => createTables(db),
        () => createUsers(db),
        () => createPosts(db),
        () => queryAllUsers(db),
        () =>
          fetchPosts(db).map(({ successes, errors }) => {
            console.log(`\nFetched ${successes.length} posts successfully`)
            if (errors.length > 0) {
              console.error(`\n${errors.length} posts failed to fetch:`)
              for (const error of errors) {
                console.error(`  ${error}`)
              }
            }
          }),
        () => {
          console.log('\n--- Cleanup ---\n')
          return db.execute('DROP TABLE posts').flatMap(() =>
            db.execute('DROP TABLE users')
          ).tap(() => {
            console.log('Tables dropped.')
          })
        },
      ]),
  ).run()
}

const createTables = (db: DB) =>
  db.execute(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).flatMap(() =>
    db.execute(`
        CREATE TABLE posts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id)
        )
      `)
  ).tap(() => {
    console.log('Schema created.\n')
  })

const createUsers = (db: DB) => {
  console.log('Inserting users with transaction...\n')
  return db.withTransaction(async (tx: DBTransaction) => {
    const users = [
      { name: 'Alice', email: 'alice@example.com' },
      { name: 'Bob', email: 'bob@example.com' },
      { name: 'Carol', email: 'carol@example.com' },
    ]
    for (const user of users) {
      const result = await tx.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        [user.name, user.email],
      ).run()
      console.log(`  Created user: ${user.name} (id: ${result})`)
    }
  })
}

const createPosts = (db: DB) => {
  console.log('\nInserting posts...\n')

  const posts = [
    { user_id: 1, title: 'Hello World', content: 'My first post!' },
    {
      user_id: 1,
      title: 'TypeScript Tips',
      content: 'Use types wisely.',
    },
    { user_id: 2, title: "Bob's Blog", content: 'Hello from Bob.' },
    { user_id: 2, title: 'Another Post', content: 'More content.' },
    { user_id: 3, title: 'Carol Says Hi', content: 'Carol here!' },
  ] satisfies Array<{ user_id: number; title: string; content: string }>
  return Task.of<void, QueryFailed | ConstraintViolation>(async () => {
    for (const post of posts) {
      await db.execute(
        'INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)',
        [post.user_id, post.title, post.content],
      ).run()
      console.log(`  Created post: ${post.title}`)
    }
  })
}

const fetchPosts = (db: DB) => {
  console.log('\nFetching posts with author names...\n')

  return Task.of<{
    successes: Array<Post & { author: string }>
    errors: QueryFailed[]
  }, QueryFailed>(async () => {
    return await db
      .stream<Post>('SELECT * FROM posts ORDER BY id')
      .withConcurrency(2)
      .map(async (post: Post) =>
        await db.query<User>(
          'SELECT name FROM users WHERE id = ?',
          [post.user_id],
        ).map((users) => ({ ...post, author: users[0]?.name ?? 'Unknown' }))
          .run()
      ).tap((post) =>
        console.log(
          `  ${post.title} by ${post.author}: "${
            post.content.substring(0, 30)
          }..."`,
        )
      ).partition()
  })
}

const queryAllUsers = (db: DB) => {
  console.log('\nQuerying all users...\n')

  return db.query<User>(
    'SELECT * FROM users ORDER BY name',
  ).tap((users) => {
    for (const user of users) {
      console.log(`  ${user.name} <${user.email}>`)
    }
  })
}

interface User {
  id: number
  name: string
  email: string
  created_at: string
}

interface Post {
  id: number
  user_id: number
  title: string
  content: string
  published_at: string
}
