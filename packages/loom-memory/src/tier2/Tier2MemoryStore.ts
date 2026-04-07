import { injectable, inject, optional } from 'inversify'
import * as path from 'node:path'
import * as os from 'node:os'
import { MEMORY_TYPES } from './loom-memory-module'

/**
 * Tier 2 SQLite Memory Storage
 * Stores user memories with full text search and embedding support.
 */

interface MemoryRow {
  id: string
  key: string
  content: string
  tier: number
  source: string
  created_at: string
  updated_at: string
  use_count: number
  session_id?: string
  agent_name?: string
  embedding?: string  // JSON array
}

@injectable()
export class Tier2MemoryStore {
  private db: any = null
  private sqlite3: any = null
  private readonly dbPath: string

  constructor() {
    // Store in ~/.loom/tier2/memories.db
    const loomDir = path.join(os.homedir(), '.loom', 'tier2')
    this.dbPath = path.join(loomDir, 'memories.db')
    
    // Ensure directory exists
    const fs = require('node:fs')
    fs.mkdirSync(loomDir, { recursive: true })
  }

  async initialize(): Promise<void> {
    // Dynamic import sqlite3
    try {
      this.sqlite3 = require('sqlite3').verbose()
    } catch {
      console.log('[Tier2] sqlite3 not available, using in-memory fallback')
      return
    }

    return new Promise((resolve, reject) => {
      this.db = new this.sqlite3.Database(this.dbPath, (err: Error) => {
        if (err) {
          reject(err)
          return
        }
        this._createTables().then(resolve).catch(reject)
      })
    })
  }

  private async _createTables(): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        content TEXT NOT NULL,
        tier INTEGER NOT NULL DEFAULT 2,
        source TEXT NOT NULL DEFAULT 'explicit',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        use_count INTEGER DEFAULT 0,
        session_id TEXT,
        agent_name TEXT,
        embedding TEXT
      )
    `
    
    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(key);
      CREATE INDEX IF NOT EXISTS idx_memories_tier ON memories(tier);
      CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent_name);
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        key, content, 
        content='memories',
        content_rowid='rowid'
      )
    `

    await this._run(createTableSQL)
    await this._run(createIndexSQL)
    console.log(`[Tier2] SQLite initialized at ${this.dbPath}`)
  }

  async store(memory: {
    id: string
    key: string
    content: string
    tier: number
    source: string
    createdAt: Date
    updatedAt: Date
    useCount: number
    sessionId?: string
    agentName?: string
    embedding?: number[]
  }): Promise<void> {
    if (!this.db) return

    const sql = `
      INSERT INTO memories (
        id, key, content, tier, source, created_at, updated_at,
        use_count, session_id, agent_name, embedding
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at,
        use_count = excluded.use_count
    `

    await this._run(sql, [
      memory.id,
      memory.key,
      memory.content,
      memory.tier,
      memory.source,
      memory.createdAt.toISOString(),
      memory.updatedAt.toISOString(),
      memory.useCount,
      memory.sessionId || null,
      memory.agentName || null,
      memory.embedding ? JSON.stringify(memory.embedding) : null
    ])

    // Update FTS index
    await this._run(`
      INSERT INTO memories_fts(rowid, key, content)
      VALUES (
        (SELECT rowid FROM memories WHERE id = ?),
        ?, ?
      )
      ON CONFLICT(rowid) DO UPDATE SET
        key = excluded.key,
        content = excluded.content
    `, [memory.id, memory.key, memory.content])
  }

  async getByKey(key: string, tier: number): Promise<MemoryRow | null> {
    if (!this.db) return null
    
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM memories WHERE key = ? AND tier = ? LIMIT 1',
        [key, tier],
        (err: Error, row: MemoryRow) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })
  }

  async getAll(options: { tier?: number; source?: string; limit: number }): Promise<MemoryRow[]> {
    if (!this.db) return []

    let where = []
    let params: any[] = []
    
    if (options.tier !== undefined) {
      where.push('tier = ?')
      params.push(options.tier)
    }
    if (options.source) {
      where.push('source = ?')
      params.push(options.source)
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM memories ${whereClause} ORDER BY use_count DESC, created_at DESC LIMIT ?`,
        [...params, options.limit],
        (err: Error, rows: MemoryRow[]) => {
          if (err) reject(err)
          else resolve(rows || [])
        }
      )
    })
  }

  async search(query: string, limit: number): Promise<MemoryRow[]> {
    if (!this.db) return []

    // Use FTS5 for full-text search
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT m.* FROM memories m
         JOIN memories_fts fts ON m.rowid = fts.rowid
         WHERE memories_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
        [query, limit],
        (err: Error, rows: MemoryRow[]) => {
          if (err) {
            // Fallback to simple LIKE search if FTS fails
            this.db.all(
              `SELECT * FROM memories 
               WHERE content LIKE ? OR key LIKE ?
               ORDER BY use_count DESC
               LIMIT ?`,
              [`%${query}%`, `%${query}%`, limit],
              (err2: Error, rows2: MemoryRow[]) => {
                if (err2) reject(err2)
                else resolve(rows2 || [])
              }
            )
          } else {
            resolve(rows || [])
          }
        }
      )
    })
  }

  async delete(key: string, tier: number): Promise<boolean> {
    if (!this.db) return false

    // Get rowid for FTS cleanup
    const row: { rowid: number } | null = await new Promise((resolve, reject) => {
      this.db.get(
        'SELECT rowid FROM memories WHERE key = ? AND tier = ?',
        [key, tier],
        (err: Error, row: { rowid: number }) => {
          if (err) reject(err)
          else resolve(row || null)
        }
      )
    })

    if (row) {
      await this._run('DELETE FROM memories_fts WHERE rowid = ?', [row.rowid])
    }

    await this._run('DELETE FROM memories WHERE key = ? AND tier = ?', [key, tier])
    return true
  }

  async incrementUseCount(id: string): Promise<void> {
    if (!this.db) return
    await this._run(
      'UPDATE memories SET use_count = use_count + 1 WHERE id = ?',
      [id]
    )
  }

  async getCount(): Promise<number> {
    if (!this.db) return 0
    
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT COUNT(*) as count FROM memories',
        (err: Error, row: { count: number }) => {
          if (err) reject(err)
          else resolve(row?.count || 0)
        }
      )
    })
  }

  private _run(sql: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(this: any, err: Error) {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  async close(): Promise<void> {
    if (!this.db) return
    return new Promise((resolve) => {
      this.db.close(() => resolve())
    })
  }
}
