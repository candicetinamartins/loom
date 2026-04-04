// Type stubs for better-sqlite3
declare module 'better-sqlite3' {
  interface Statement {
    run(...params: any[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: any[]): any
    all(...params: any[]): any[]
    iterate(...params: any[]): IterableIterator<any>
  }

  interface Database {
    prepare(sql: string): Statement
    exec(sql: string): this
    close(): void
    pragma(pragma: string, options?: { simple?: boolean }): any
  }

  type DatabaseConstructor = {
    (filename: string, options?: any): Database
    new(filename: string, options?: any): Database
    Database: Database
  }

  const Database: DatabaseConstructor
  export = Database
}
