// Where the Workspace keeps its state between visits: IndexedDB, through Dexie.
import { Dexie, type EntityTable } from 'dexie'
import type { Chart } from './chart.ts'

/** Which IndexedDB to use: the browser's in the app, an in-memory one in tests. */
export interface Database {
  indexedDB: IDBFactory
  IDBKeyRange: typeof IDBKeyRange
}

const DATABASE_NAME = 'tracker-keeper'

/** The version of what this app stores. A change to the stores needs a new one, with an upgrade from the last. */
const SCHEMA_VERSION = 1

interface StoredSourcePdf {
  /** The source PDF's SHA-256, as lowercase hex. */
  sha256: string
  bytes: Uint8Array
}

export class Storage extends Dexie {
  sourcePdfs!: EntityTable<StoredSourcePdf, 'sha256'>
  charts!: EntityTable<Chart, 'id'>

  constructor(database: Database) {
    super(DATABASE_NAME, database)
    this.version(SCHEMA_VERSION).stores({ sourcePdfs: 'sha256', charts: 'id', projects: 'id' })
  }
}

/** Opens the database, refusing one saved by a newer version of the app, which this one could damage. */
export async function openStorage(database: Database) {
  const storage = new Storage(database)
  await storage.open()
  // Dexie opens a newer database without complaint, and keeps schema version n as IndexedDB version n × 10.
  if (storage.backendDB().version > SCHEMA_VERSION * 10) {
    storage.close()
    throw new Error(
      'Your charts were saved by a newer version of tracker-keeper. Reload the page to get the newest version; nothing has been changed.',
    )
  }
  return storage
}
