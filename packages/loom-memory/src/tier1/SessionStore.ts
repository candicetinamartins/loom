import { injectable } from 'inversify'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  SessionEventKind,
  RawSessionEvent,
  ActiveSession,
  SessionContextSummary,
  ToolCallPayload,
  FileWritePayload,
  FileDeletePayload,
  BashExecPayload,
} from './session-events.schema'

/**
 * SessionStore — Tier 1 Working Memory
 *
 * Two layers:
 *   Hot layer  — plain in-process Map, zero-latency reads on every LLM turn
 *   Cold layer — append-only SQLite journal, survives crashes, promotable to Tier 2
 *
 * All writes are synchronous (better-sqlite3 sync API), so call-sites are never async.
 * Reads are also synchronous for the same reason — critical since this runs in the
 * hot path before every LLM call.
 *
 * Schema (created on first initialize()):
 *   session_events(id TEXT PK, session_id TEXT, kind TEXT, payload TEXT, ts INTEGER)
 */
@injectable()
export class SessionStore {
  private db!: Database.Database
  private stmtInsert!: Database.Statement
  private stmtBySession!: Database.Statement
  private stmtByKind!: Database.Statement
  private stmtCleanOld!: Database.Statement
  private hotLayer: Map<string, ActiveSession> = new Map()
  private recentTools: Map<string, string[]> = new Map() // sessionId → last 5 tool names
  private initialised = false

  // ── Init ──────────────────────────────────────────────────────────────────────

  initialize(dataDir: string): void {
    if (this.initialised) return
    this.initialised = true

    fs.mkdirSync(dataDir, { recursive: true })

    // Lazy require so the module can be imported without better-sqlite3 being installed
    // (useful in frontend bundles that tree-shake this file away)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3') as typeof Database
    this.db = new BetterSqlite3(path.join(dataDir, 'tier1.db'))

    // WAL mode: concurrent reads don't block writes; safe for single writer
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id         TEXT    PRIMARY KEY,
        session_id TEXT    NOT NULL,
        kind       TEXT    NOT NULL,
        payload    TEXT    NOT NULL,
        ts         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_se_session
        ON session_events (session_id, ts DESC);
    `)

    this.stmtInsert = this.db.prepare(
      'INSERT INTO session_events (id, session_id, kind, payload, ts) VALUES (?,?,?,?,?)',
    )
    this.stmtBySession = this.db.prepare(
      'SELECT * FROM session_events WHERE session_id = ? ORDER BY ts ASC',
    )
    this.stmtByKind = this.db.prepare(
      'SELECT * FROM session_events WHERE session_id = ? AND kind = ? ORDER BY ts ASC',
    )
    this.stmtCleanOld = this.db.prepare(
      'DELETE FROM session_events WHERE session_id IN (' +
      '  SELECT DISTINCT session_id FROM session_events WHERE kind = ? AND ts < ?' +
      ')',
    )

    // Clean up sessions older than 48 h on start
    const cutoff = Date.now() - 48 * 60 * 60 * 1000
    this.stmtCleanOld.run('session_start', cutoff)
  }

  /** Call from electron-main's before-quit handler to flush WAL cleanly */
  destroy(): void {
    if (this.db) this.db.close()
  }

  // ── Session lifecycle ─────────────────────────────────────────────────────────

  startSession(agentName: string, task: string): string {
    const sessionId = `sess-${Date.now()}-${randomUUID().slice(0, 8)}`
    const session: ActiveSession = {
      sessionId,
      agentName,
      task,
      startedAt: Date.now(),
      filesModified: new Set(),
      toolCallCount: 0,
    }
    this.hotLayer.set(sessionId, session)
    this.recentTools.set(sessionId, [])
    this._append(sessionId, 'session_start', { agentName, task })
    return sessionId
  }

  endSession(sessionId: string, promoted = false): void {
    this._append(sessionId, 'session_end', { promoted })
    this.hotLayer.delete(sessionId)
    this.recentTools.delete(sessionId)
  }

  getActiveSession(): ActiveSession | null {
    // Returns most-recently-started session that hasn't been ended
    const sessions = Array.from(this.hotLayer.values())
    if (sessions.length === 0) return null
    return sessions.sort((a, b) => b.startedAt - a.startedAt)[0]
  }

  getSession(sessionId: string): ActiveSession | undefined {
    return this.hotLayer.get(sessionId)
  }

  // ── Recording ─────────────────────────────────────────────────────────────────

  recordFileWrite(opts: {
    sessionId: string
    path: string
    before: string | null
    after: string
    agentName: string
  }): string {
    const eventId = this._append(opts.sessionId, 'file_write', {
      path: opts.path,
      before: opts.before,
      after: opts.after,
      agentName: opts.agentName,
    } satisfies FileWritePayload)

    const session = this.hotLayer.get(opts.sessionId)
    if (session) {
      session.filesModified.add(opts.path)
    }

    return eventId
  }

  recordFileDelete(opts: {
    sessionId: string
    path: string
    before: string
  }): void {
    this._append(opts.sessionId, 'file_delete', {
      path: opts.path,
      before: opts.before,
    } satisfies FileDeletePayload)

    const session = this.hotLayer.get(opts.sessionId)
    if (session) session.filesModified.add(opts.path)
  }

  recordToolExecution(opts: {
    sessionId: string
    tool: string
    args: Record<string, unknown>
    result: string
    durationMs: number
  }): void {
    this._append(opts.sessionId, 'tool_call', {
      tool: opts.tool,
      args: opts.args,
      result: opts.result,
      durationMs: opts.durationMs,
    } satisfies ToolCallPayload)

    const session = this.hotLayer.get(opts.sessionId)
    if (session) session.toolCallCount++

    const recent = this.recentTools.get(opts.sessionId) ?? []
    recent.push(opts.tool)
    if (recent.length > 5) recent.shift()
    this.recentTools.set(opts.sessionId, recent)
  }

  recordBashExec(opts: {
    sessionId: string
    command: string
    output: string
    exitCode: number
  }): void {
    this._append(opts.sessionId, 'bash_exec', {
      command: opts.command,
      output: opts.output.slice(0, 2000), // cap at 2KB
      exitCode: opts.exitCode,
    } satisfies BashExecPayload)
  }

  // ── Reading ───────────────────────────────────────────────────────────────────

  getFileWriteEvents(sessionId: string): Array<{ eventId: string; payload: FileWritePayload; ts: number }> {
    const rows = this.stmtByKind.all(sessionId, 'file_write') as RawSessionEvent[]
    return rows.map(r => ({
      eventId: r.id,
      payload: JSON.parse(r.payload) as FileWritePayload,
      ts: r.ts,
    }))
  }

  getToolHistory(sessionId: string, limit = 20): Array<{ tool: string; durationMs: number; ts: number }> {
    const rows = this.stmtByKind.all(sessionId, 'tool_call') as RawSessionEvent[]
    return rows
      .slice(-limit)
      .map(r => {
        const p = JSON.parse(r.payload) as ToolCallPayload
        return { tool: p.tool, durationMs: p.durationMs, ts: r.ts }
      })
  }

  getSessionJournal(sessionId: string): RawSessionEvent[] {
    return this.stmtBySession.all(sessionId) as RawSessionEvent[]
  }

  getContextSummary(sessionId: string): SessionContextSummary {
    const session = this.hotLayer.get(sessionId)
    const agentName = session?.agentName ?? 'unknown'
    const task = session?.task ?? ''
    const filesModified = session ? Array.from(session.filesModified) : []
    const toolCallCount = session?.toolCallCount ?? 0
    const recentTools = this.recentTools.get(sessionId) ?? []
    const sessionAgeMs = session ? Date.now() - session.startedAt : 0

    return { sessionId, agentName, task, filesModified, toolCallCount, recentTools, sessionAgeMs }
  }

  /** Format as a compact string for injection into LLM system prompt */
  formatContextForLLM(sessionId: string): string {
    const s = this.getContextSummary(sessionId)
    if (!s.agentName || s.agentName === 'unknown') return ''

    const age = this._fmtAge(s.sessionAgeMs)
    const files = s.filesModified.length > 0
      ? `\nModified: ${s.filesModified.map(p => path.basename(p)).join(', ')}`
      : ''
    const tools = s.recentTools.length > 0
      ? `\nRecent tools: ${s.recentTools.join(' → ')}`
      : ''

    return `[SESSION]\nAgent: ${s.agentName} (${age}) | Task: ${s.task}${files}${tools}`
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _append(sessionId: string, kind: SessionEventKind, payload: unknown): string {
    const id = randomUUID()
    this.stmtInsert.run(id, sessionId, kind, JSON.stringify(payload), Date.now())
    return id
  }

  private _fmtAge(ms: number): string {
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m`
    return `${Math.floor(m / 60)}h`
  }
}
