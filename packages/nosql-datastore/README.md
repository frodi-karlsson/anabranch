# @anabranch/nosql-datastore

Google Cloud Datastore adapter for
[@anabranch/nosql](https://jsr.io/@anabranch/nosql).

## Usage

```ts
import { Collection } from '@anabranch/nosql'
import { createDatastore } from '@anabranch/nosql-datastore'

const connector = createDatastore({ projectId: 'my-project', kind: 'users' })
const users = await Collection.connect(connector, 'users').run()

await users.put('alice', { name: 'Alice', email: 'alice@example.com' }).run()

const alice = await users.get('alice').run()
```

## Installation

**Deno (JSR)**

```ts
import { createDatastore } from 'jsr:@anabranch/nosql-datastore'
```

**Node / Bun (npm)**

```sh
npm install @anabranch/nosql-datastore
```

## API reference

See
[generated documentation](https://frodi-karlsson.github.io/anabranch/nosql-datastore)
for full API details.
