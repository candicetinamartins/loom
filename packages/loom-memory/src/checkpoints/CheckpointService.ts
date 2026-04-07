import { injectable, inject } from 'inversify'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { SessionStore } from '../tier1/SessionStore'
import { CheckpointStore, type CheckpointRecord, type CheckpointFile } from './CheckpointStore'
import { MEMORY_TYPES } from '../loom-memory-module'

/**
 * CheckpointService — AI Checkpoint / Revert Timeline
 *
 * Called by WriteFileTool and EditFileTool before and after every agent file write.
 *
 * Flow:
 *   1. Tool calls beforeWrite(sessionId, filePath) → we read the current file content
 *      and stash it in a pending map keyed by (sessionId, filePath)
 *   2. Tool writes the file
 *   3. Tool calls afterWrite(sessionId, filePath, newContent, agentName, taskLabel)
 *      → we build a CheckpointRecord with { before, after } and append to NDJSON store
 *
 * Restore:
 *   restoreCheckpoint(id) → for each file in the record, write `before` back to disk
 */
@injectable()
export class CheckpointService {
  // Pending pre-write snapshots, keyed by "sessionId::filePath"
  private pending: Map<string, { before: string | null }> = new Map()

  constructor(
    @inject(MEMORY_TYPES.SessionStore) private sessionStore: SessionStore,
    @inject(MEMORY_TYPES.CheckpointStore) private store: CheckpointStore,
  ) {}

  // ── Called by tools BEFORE the file write ────────────────────────────────────

  /**
   * Reads the current file content (the "before" state) and stashes it.
   * Called synchronously on every write/edit tool invocation.
   * Returns a pending key to pass to afterWrite().
   */
  async beforeWrite(sessionId: string, filePath: string): Promise<string> {
    const key = `${sessionId}::${filePath}`
    let before: string | null = null
    try {
      before = await fs.readFile(filePath, 'utf-8')
    } catch {
      // File does not exist yet — new file
      before = null
    }
    this.pending.set(key, { before })
    return key
  }

  // ── Called by tools AFTER the file write ─────────────────────────────────────

  /**
   * Completes the checkpoint: pairs the before-state with the after content,
   * appends to the session's journal via SessionStore, and persists to NDJSON.
   */
  async afterWrite(opts: {
    sessionId: string
    filePath: string
    after: string
    agentName: string
    label?: string
  }): Promise<CheckpointRecord> {
    const key = `${opts.sessionId}::${opts.filePath}`
    const pending = this.pending.get(key)
    const before = pending?.before ?? null
    this.pending.delete(key)

    // Derive a human-readable label if not provided
    const label = opts.label ?? this._deriveLabel(opts.agentName, opts.filePath, before, opts.after)

    const file: CheckpointFile = {
      path: opts.filePath,
      before,
      after: opts.after,
    }

    const record: CheckpointRecord = {
      id: `cp-${Date.now()}-${randomUUID().slice(0, 8)}`,
      sessionId: opts.sessionId,
      agentName: opts.agentName,
      label,
      timestamp: Date.now(),
      files: [file],
    }

    // Record in SessionStore journal (Tier 1)
    this.sessionStore.recordFileWrite({
      sessionId: opts.sessionId,
      path: opts.filePath,
      before,
      after: opts.after,
      agentName: opts.agentName,
    })

    // Persist to NDJSON
    this.store.append(record)

    return record
  }

  // ── Restore ────────────────────────────────────────────────────────────────────

  /**
   * Restore all files in a checkpoint back to their before-state.
   * New files (before = null) are deleted.
   * Returns the list of paths that were restored.
   */
  async restoreCheckpoint(checkpointId: string): Promise<string[]> {
    const record = this.store.findById(checkpointId)
    if (!record) throw new Error(`Checkpoint not found: ${checkpointId}`)

    const restored: string[] = []
    for (const file of record.files) {
      if (file.before === null) {
        // File was newly created by the agent — delete it on restore
        try {
          await fs.unlink(file.path)
        } catch {
          // Already gone — that's fine
        }
      } else {
        // Write the before-state back
        await fs.mkdir(path.dirname(file.path), { recursive: true })
        await fs.writeFile(file.path, file.before, 'utf-8')
      }
      restored.push(file.path)
    }

    return restored
  }

  // ── Queries ───────────────────────────────────────────────────────────────────

  getCheckpoints(sessionId?: string, days = 7): CheckpointRecord[] {
    if (sessionId) return this.store.readBySession(sessionId, days)
    return this.store.readRecent(days)
  }

  getCheckpointById(id: string): CheckpointRecord | null {
    return this.store.findById(id)
  }

  // ── Named Checkpoints ──────────────────────────────────────────────────────────

  /**
   * Create a named checkpoint of the current session state.
   * Called by CheckpointCreateTool when agent explicitly requests a checkpoint.
   * Captures all files modified in this session.
   */
  async createNamedCheckpoint(opts: {
    sessionId: string
    name: string
    description?: string
    agentName: string
  }): Promise<CheckpointRecord> {
    // Get all file write events from this session
    const journal = this.sessionStore.getSessionJournal(opts.sessionId)
    const fileWriteEvents = journal.filter(e => e.kind === 'file_write')
    
    // Get unique files (most recent state per file)
    const fileMap = new Map<string, { path: string; content: string }>()
    
    for (const event of fileWriteEvents) {
      const payload = JSON.parse(event.payload) as { path: string; after?: string }
      const filePath = payload.path
      const content = payload.after
      if (content !== undefined) {
        fileMap.set(filePath, { path: filePath, content })
      }
    }
    
    // Read current state of all modified files
    const files: CheckpointFile[] = []
    for (const { path: filePath } of fileMap.values()) {
      try {
        const currentContent = await fs.readFile(filePath, 'utf-8')
        files.push({
          path: filePath,
          before: currentContent, // Named checkpoint captures current as "before" for restore
          after: currentContent,
        })
      } catch {
        // File may have been deleted since - skip
      }
    }
    
    const record: CheckpointRecord = {
      id: `cp-named-${Date.now()}-${randomUUID().slice(0, 8)}`,
      sessionId: opts.sessionId,
      agentName: opts.agentName,
      label: opts.name,
      description: opts.description,
      timestamp: Date.now(),
      files,
    }
    
    // Persist to NDJSON store
    this.store.append(record)
    
    // Record in session journal
    this.sessionStore.recordCheckpoint({
      sessionId: opts.sessionId,
      checkpointId: record.id,
      name: opts.name,
      agentName: opts.agentName,
    })
    
    return record
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _deriveLabel(agentName: string, filePath: string, before: string | null, after: string): string {
    const filename = path.basename(filePath)
    if (before === null) return `${agentName} · created ${filename}`

    // Count changed lines for a short diff summary
    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')
    const added = afterLines.length - beforeLines.length
    const addedStr = added > 0 ? `+${added}` : added < 0 ? `${added}` : '~'

    return `${agentName} · edited ${filename} (${addedStr} lines)`
  }
}
