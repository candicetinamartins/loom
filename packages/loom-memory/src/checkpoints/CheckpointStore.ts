import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * A checkpoint records all file snapshots before an agent write task.
 * Stored as append-only NDJSON in .loom/checkpoints/YYYY-MM-DD.ndjson
 * Each line is one complete CheckpointRecord (never updated, never deleted).
 */
export interface CheckpointRecord {
  id: string
  sessionId: string
  agentName: string
  label: string                // "CodeSmith · fixed retry throw"
  timestamp: number            // Date.now()
  files: CheckpointFile[]
}

export interface CheckpointFile {
  path: string
  before: string | null       // null = file did not exist before this write
  after: string
}

/**
 * CheckpointStore — thin NDJSON persistence layer.
 *
 * Writes to `.loom/checkpoints/YYYY-MM-DD.ndjson`.
 * Reads last 7 days for the timeline UI.
 * Files older than 7 days are ignored (not deleted — user may want them).
 */
export class CheckpointStore {
  private checkpointDir: string

  constructor(workspaceRoot: string) {
    this.checkpointDir = path.join(workspaceRoot, '.loom', 'checkpoints')
    fs.mkdirSync(this.checkpointDir, { recursive: true })
  }

  /** Append one checkpoint record synchronously — safe to call in file write hot path */
  append(record: CheckpointRecord): void {
    const filePath = this._todayFile()
    fs.appendFileSync(filePath, JSON.stringify(record) + '\n', 'utf-8')
  }

  /** Read today's checkpoints */
  readToday(): CheckpointRecord[] {
    return this._readFile(this._todayFile())
  }

  /** Read last 7 days of checkpoints, newest first */
  readRecent(days = 7): CheckpointRecord[] {
    const records: CheckpointRecord[] = []
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 86400_000)
      const file = this._dateFile(d)
      records.push(...this._readFile(file))
    }
    // Sort newest first
    return records.sort((a, b) => b.timestamp - a.timestamp)
  }

  /** Read checkpoints for a specific session */
  readBySession(sessionId: string, days = 7): CheckpointRecord[] {
    return this.readRecent(days).filter(r => r.sessionId === sessionId)
  }

  /** Find a single checkpoint by ID */
  findById(checkpointId: string): CheckpointRecord | null {
    for (const record of this.readRecent(7)) {
      if (record.id === checkpointId) return record
    }
    return null
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private _todayFile(): string {
    return this._dateFile(new Date())
  }

  private _dateFile(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return path.join(this.checkpointDir, `${y}-${m}-${d}.ndjson`)
  }

  private _readFile(filePath: string): CheckpointRecord[] {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      return raw
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          try { return JSON.parse(line) as CheckpointRecord }
          catch { return null }
        })
        .filter((r): r is CheckpointRecord => r !== null)
    } catch {
      return []
    }
  }
}
