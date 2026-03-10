import { Datastore } from '@google-cloud/datastore'
import type { DatastoreOptions as DatastoreConstructorOptions } from '@google-cloud/datastore'
import type { DocumentConnector } from '@anabranch/nosql'
import { DatastoreAdapter, DatastoreKey, DatastoreQuery } from './datastore.ts'
import { DatastoreConnectionFailed } from './errors.ts'

/**
 * Creates a {@link DocumentConnector} for Google Cloud Datastore.
 */
export function createDatastore<TDoc>(
  options: DatastoreOptions,
): DocumentConnector<TDoc, DatastoreQuery, DatastoreKey> {
  let client: Datastore | null = null

  try {
    client = new Datastore({
      ...options,
    })
  } catch (error) {
    throw new DatastoreConnectionFailed(
      error instanceof Error ? error.message : String(error),
      error,
    )
  }

  const kind = options.kind ?? ''

  return {
    connect() {
      if (!client) {
        return Promise.reject(new DatastoreConnectionFailed('Connector closed'))
      }
      return Promise.resolve(new DatastoreAdapter(client, kind))
    },
    end() {
      client?.clients_.forEach((c) => c.close())
      client = null
      return Promise.resolve()
    },
  }
}

/**
 * Options for creating a Datastore connector.
 */
export interface DatastoreOptions extends DatastoreConstructorOptions {
  /** The ID of the Google Cloud project. */
  projectId: string
  /** The API endpoint to use. */
  apiEndpoint?: string
  /** Path to key file. */
  keyFilename?: string
  /** Credentials object. */
  credentials?: {
    client_email?: string
    private_key?: string
  }
  /** The kind prefix for entities. */
  kind?: string
}
