/**
 * Kuzu stub for CI builds
 * This provides type definitions for the Kuzu native module
 */

export class Database {
  constructor(_path: string) {}
  
  async init(): Promise<void> {}
  
  async query(_query: string): Promise<any> {
    return { getAll: () => [] }
  }
  
  async close(): Promise<void> {}
}

export class Connection {
  constructor(_db: Database) {}
  
  async query(_query: string): Promise<any> {
    return { getAll: () => [] }
  }
}

export default {
  Database,
  Connection,
}
