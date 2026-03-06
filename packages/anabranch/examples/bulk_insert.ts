import { Source } from "../index.ts";

interface UserRecord {
  id: string;
  email: string;
  name: string;
}

const mockDb = {
  insertMany: async (users: UserRecord[]) => {
    await new Promise((r) => setTimeout(r, 100));
    console.log(`Inserted batch of ${users.length} users`);
    return users.length;
  },
};

const userStream = Source.from<UserRecord, Error>(async function* () {
  for (let i = 1; i <= 23; i++) {
    yield {
      id: String(i),
      email: `user${i}@example.com`,
      name: `User ${i}`,
    };
  }
});

const insertTask = userStream
  .chunks(10)
  .map(async (batch) => {
    const inserted = await mockDb.insertMany(batch);
    return { batchSize: batch.length, inserted };
  })
  .collect();

const result = await insertTask;
console.log(`\nTotal batches processed: ${result.length}`);
console.log(
  `Total records inserted: ${result.reduce((sum, r) => sum + r.inserted, 0)}`,
);
