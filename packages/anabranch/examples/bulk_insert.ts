/**
 * Example of using `chunks` to batch insert records into a database.
 *
 * This example simulates inserting user records into a database in batches of 10. It demonstrates how to use `chunks` to group records and perform asynchronous operations on each batch.
 *
 * Run with:
 * ```bash
deno run --allow-net --allow-read --allow-write packages/anabranch/examples/bulk_insert.ts
 */
import { Source } from '../index.ts'

interface UserRecord {
  id: string
  email: string
  name: string
}

const mockDb = {
  insertMany: async (users: UserRecord[]) => {
    await new Promise((r) => setTimeout(r, 100))
    console.log(`Inserted batch of ${users.length} users`)
    return users.length
  },
}

const userStream = Source.from<UserRecord, Error>(async function* () {
  for (let i = 1; i <= 23; i++) {
    yield {
      id: String(i),
      email: `user${i}@example.com`,
      name: `User ${i}`,
    }
  }
})

const summary = await userStream
  .tap((_, i) => {
    if (i % 5 === 0) console.log(`Processed ${i} records so far...`)
  })
  .chunks(10)
  .map(async (batch) => {
    const inserted = await mockDb.insertMany(batch)
    return { batchSize: batch.length, inserted }
  })
  .fold(
    (acc, r) => ({
      batches: acc.batches + 1,
      totalInserted: acc.totalInserted + r.inserted,
    }),
    { batches: 0, totalInserted: 0 },
  )

console.log(`\nTotal batches processed: ${summary.batches}`)
console.log(`Total records inserted: ${summary.totalInserted}`)
