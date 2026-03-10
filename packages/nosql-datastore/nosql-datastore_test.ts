import { assertEquals, assertExists } from '@std/assert'
import { createDatastore, PropertyFilter } from './index.ts'
import { DatastoreKey, DatastoreQuery } from './datastore.ts'
import { Task } from '@anabranch/anabranch'
import { DocumentAdapter } from '@anabranch/nosql'

const DATASTORE_URL = Deno.env.get('DATASTORE_EMULATOR_HOST') ||
  Deno.env.get('DATASTORE_PROJECT_ID')
const apiEndpoint = Deno.env.get('DATASTORE_EMULATOR_HOST')
  ? `http://${Deno.env.get('DATASTORE_EMULATOR_HOST')}`
  : undefined
const projectId = Deno.env.get('DATASTORE_PROJECT_ID') || 'test-project'

const testConfig = {
  ignore: !DATASTORE_URL,
  sanitizeOps: false,
  sanitizeResources: false,
}

Deno.test({
  name: 'DatastoreAdapter.put and get - should store and retrieve document',
  ...testConfig,
  async fn() {
    const connector = createDatastore<{ name: string; count: number }>({
      projectId,
      apiEndpoint,
      kind: 'TestDocument',
    })

    const adapter = await connector.connect()
    const testKey = 'doc-1'
    const testDoc = { name: 'test', count: 1 }

    try {
      await adapter.put(testKey, testDoc)
      const retrieved = await adapter.get(testKey)

      assertExists(retrieved)
      assertEquals(retrieved.name, testDoc.name)
      assertEquals(retrieved.count, testDoc.count)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter.delete - should remove a document',
  ...testConfig,
  async fn() {
    const connector = createDatastore<{ name: string }>({
      projectId,
      apiEndpoint,
      kind: 'TestDocument',
    })

    const adapter = await connector.connect()
    const testKey = 'doc-delete-test'

    try {
      await adapter.put(testKey, { name: 'delete-me' })
      await waitForResults(
        adapter,
        (q) => q.filter(new PropertyFilter('name', '=', 'delete-me')),
        1,
      )
      const before = await adapter.get(testKey)
      assertExists(before)

      await adapter.delete(testKey)
      const after = await adapter.get(testKey)
      assertEquals(after, null)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter.putMany - should batch insert documents',
  ...testConfig,
  async fn() {
    const connector = createDatastore<{ name: string; count: number }>({
      projectId,
      apiEndpoint,
      kind: 'TestDocumentBatch',
    })

    const adapter = await connector.connect()
    const entries = [
      { key: 'batch-1', doc: { name: 'Alice', count: 10 } },
      { key: 'batch-2', doc: { name: 'Bob', count: 20 } },
      { key: 'batch-3', doc: { name: 'Charlie', count: 30 } },
    ]

    try {
      await adapter.putMany(entries)

      await waitForResults(
        adapter,
        (q) => q,
        3,
      )
      const retrieved = await adapter.get('batch-2')
      assertExists(retrieved)
      assertEquals(retrieved.name, 'Bob')
      assertEquals(retrieved.count, 20)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter.query - should stream query results',
  ...testConfig,
  async fn() {
    const kind = 'TestDocumentQuery'
    const connector = createDatastore<{ name: string; status: string }>({
      projectId,
      apiEndpoint,
      kind,
    })

    const adapter = await connector.connect()

    try {
      await adapter.putMany([
        { key: 'q-1', doc: { name: 'User 1', status: 'active' } },
        { key: 'q-2', doc: { name: 'User 2', status: 'inactive' } },
        { key: 'q-3', doc: { name: 'User 3', status: 'active' } },
      ])

      await waitForResults(
        adapter,
        (q) => q.filter(new PropertyFilter('status', '=', 'active')),
        2,
      )

      const results = []
      for await (
        const doc of adapter.query((query) =>
          query.filter(new PropertyFilter('status', '=', 'active'))
        )
      ) {
        results.push(doc)
      }

      assertEquals(results.length, 2)
      assertExists(results.find((d) => d.name === 'User 1'))
      assertExists(results.find((d) => d.name === 'User 3'))
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter.query - handles limit and pagination',
  ...testConfig,
  async fn() {
    const kind = 'TestDocumentPagination'
    const connector = createDatastore<{ name: string; status: string }>({
      projectId,
      apiEndpoint,
      kind,
    })

    const adapter = await connector.connect()

    try {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        key: `p-${i + 1}`,
        doc: { name: `User ${i + 1}`, status: 'active' },
      }))
      await adapter.putMany(entries)

      await waitForResults(
        adapter,
        (q) => q.filter(new PropertyFilter('status', '=', 'active')),
        10,
      )

      const results = []
      for await (
        const doc of adapter.query((query) =>
          query.filter(new PropertyFilter('status', '=', 'active')).limit(3)
        )
      ) {
        results.push(doc)
      }

      assertEquals(results.length, 3)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter.putMany - handles > 500 entities (chunking)',
  ...testConfig,
  async fn() {
    const connector = createDatastore<{ name: string; index: number }>({
      projectId,
      apiEndpoint,
      kind: 'TestDocumentLargeBatch',
    })
    const adapter = await connector.connect()

    try {
      const entries = Array.from({ length: 505 }, (_, i) => ({
        key: `bulk-${i}`,
        doc: { name: 'bulk', index: i },
      }))

      await adapter.putMany(entries)

      await waitForResults(
        adapter,
        (q) => q.filter(new PropertyFilter('index', '=', 504)),
        1,
      )

      const retrieved = await adapter.get('bulk-504')
      assertExists(retrieved)
      assertEquals(retrieved.index, 504)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter - gracefully handles missing documents',
  ...testConfig,
  async fn() {
    const connector = createDatastore<{ name: string }>({
      projectId,
      apiEndpoint,
      kind: 'TestDocumentMissing',
    })
    const adapter = await connector.connect()

    try {
      const retrieved = await adapter.get('does-not-exist')
      assertEquals(retrieved, null)

      await adapter.delete('also-does-not-exist')
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name: 'DatastoreAdapter.query - returns empty stream for no matches',
  ...testConfig,
  async fn() {
    const connector = createDatastore<{ name: string; status: string }>({
      projectId,
      apiEndpoint,
      kind: 'TestDocumentEmptyQuery',
    })
    const adapter = await connector.connect()

    try {
      await adapter.put('e-1', { name: 'test', status: 'active' })

      await waitForResults(
        adapter,
        (q) => q.filter(new PropertyFilter('status', '=', 'active')),
        1,
      )

      const results = []
      for await (
        const doc of adapter.query((query) =>
          query.filter(new PropertyFilter('status', '=', 'super-rare-status'))
        )
      ) {
        results.push(doc)
      }

      assertEquals(results.length, 0)
    } finally {
      await connector.end()
    }
  },
})

Deno.test({
  name:
    'DatastoreAdapter.query - supports ancestor queries for strong consistency',
  ...testConfig,
  async fn() {
    const kind = 'TestDocumentAncestor'
    const connector = createDatastore<{ name: string; tenant: string }>({
      projectId,
      apiEndpoint,
      kind,
    })

    const adapter = await connector.connect()

    try {
      await adapter.putMany([
        {
          key: ['Tenant', 'acme', kind, 'user-1'],
          doc: { name: 'Alice', tenant: 'acme' },
        },
        {
          key: ['Tenant', 'acme', kind, 'user-2'],
          doc: { name: 'Bob', tenant: 'acme' },
        },
        {
          key: ['Tenant', 'other', kind, 'user-3'], // A completely different ancestor!
          doc: { name: 'Charlie', tenant: 'other' },
        },
      ])

      const results = []

      for await (
        const doc of adapter.query((query, key) =>
          query.hasAncestor(key(['Tenant', 'acme']))
        )
      ) {
        results.push(doc)
      }

      assertEquals(results.length, 2)
      assertExists(results.find((d) => d.name === 'Alice'))
      assertExists(results.find((d) => d.name === 'Bob'))
    } finally {
      await connector.end()
    }
  },
})

// A helper to poll the emulator until its indexes catch up
async function waitForResults<T>(
  adapter: DocumentAdapter<T, DatastoreQuery, DatastoreKey>,
  queryBuilder: DatastoreQuery,
  expectedCount: number,
  maxRetries = 10,
): Promise<T[]> {
  return await Task.of(async () => {
    const results: T[] = []
    for await (const doc of adapter.query(queryBuilder)) {
      results.push(doc)
    }
    if (results.length !== expectedCount) {
      throw new Error(
        `Expected ${expectedCount} results, got ${results.length}`,
      )
    }
    return results
  })
    .retry({
      attempts: maxRetries - 1,
      delay: 1000,
    })
    .run()
}
