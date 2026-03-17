# @anabranch/nosql

A NoSQL document collection abstraction with Task/Stream semantics for
error-tolerant document operations.

## Usage

```ts
import { Collection, createInMemory } from '@anabranch/nosql'

interface User {
  name: string
  email: string
  status: 'active' | 'inactive'
}

const connector = createInMemory<User, (u: User) => boolean, string>()
const users = await Collection.connect(connector, 'users').run()

// CRUD operations return Tasks
await users.put('alice', {
  name: 'Alice',
  email: 'alice@example.com',
  status: 'active',
}).run()

const alice = await users.get('alice').run()

// Query with streaming results
const activeUsers = await users
  .find((u) => u.status === 'active')
  .collect()
```

## Installation

**Deno (JSR)**

```ts
import { Collection, createInMemory } from 'jsr:@anabranch/nosql'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/nosql
```

## Adapters

- [@anabranch/nosql-datastore](https://jsr.io/@anabranch/nosql-datastore) -
  Google Cloud Datastore

## API reference

See [generated documentation](https://frodi-karlsson.github.io/anabranch/nosql)
for full API details.
