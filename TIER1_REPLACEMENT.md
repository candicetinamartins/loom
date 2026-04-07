# Tier 1 Memory Replacement — SessionStore

**Status:** Planned
**Replaces:** `packages/loom-memory/src/tier1/session.schema.ts` (Drizzle ORM schema, OpenCode-dependent)
**Depends on:** `better-sqlite3` (already in `loom-memory` deps)
**Unlocks:** AI Checkpoint / Revert Timeline (Ctrl+Shift+Z)

---

## 1. Why Replace Tier 1

The current Tier 1 is a Drizzle ORM schema (`session.schema.ts`) with two tables:

| Table | Purpose |
|-------|---------|
| `agent_sessions` | Tracks current task + open files per agent |
| `tool_executions` | Logs tool calls with args/results |

**Problems:**

1. **OpenCode was the writer.** Nothing in loom currently writes to these tables. `MemoryService.initTier2()` only sets `tier2Ready = true` if `graphService` is available — it never initialises the Drizzle db at all. Tier 1 is entirely dead code.

2. **Drizzle is the wrong tool.** Drizzle ORM adds schema migration complexity for data that is ephemeral by design. We already have `better-sqlite3` as a direct dependency — no ORM needed for an append-only journal.

3. **No hook into writes.** `WriteFileTool` and `EditFileTool` execute file operations with zero callbacks. Without a pre-write snapshot, there is nothing to revert to. This blocks the entire Checkpoint feature.

4. **In-memory Map in `MemoryIsolationService`.** Sessions stored in a `Map<string, SessionMemory>` vanish on crash. The SQLite journal fixes this.

---

## 2. Architecture: SessionStore

```
┌─────────────────────────────────────────────────────────────┐
│                         Tier 1 — SessionStore               │
│                                                             │
│  ┌─────────────────────┐    ┌──────────────────────────┐   │
│  │  In-Memory Hot Layer │    │  SQLite Event Journal    │   │
│  │  (zero-latency reads)│    │  (crash-safe, promotable)│   │
│  │                     │    │                          │   │
│  │  activeTask: string  │    │  session_events table    │   │
│  │  contextFiles: Map   │    │  - id, session_id        │   │
│  │  toolHistory: []     │    │  - kind (enum)           │   │
│  │  agentMessages: []   │    │  - payload_json          │   │
│  │  pendingCheckpoints: │    │  - ts (epoch ms)         │   │
│  └─────────────────────┘    └──────────────────────────┘   │
│                                                             │
│  API: startSession · endSession · recordToolExecution       │
│       recordFileWrite · getContext · snapshotForCheckpoint  │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  WriteFileTool                 CheckpointService
  EditFileTool             (reads snapshots, stores .loom/checkpoints/)
         │
         ▼
  MemoryService.formatForContext()
  (Tier 1 context injected into every LLM turn)
```

### Design decisions

| Decision | Reasoning |
|----------|-----------|
| No ORM | Append-only journal — one prepared statement, never UPDATE |
| Event-sourced | Replay any session from journal if process crashes |
| Session-scoped hot layer | Wipe on `endSession()`, never pollute next session |
| `better-sqlite3` (sync) | Sub-millisecond reads; safe in Node single-thread; already a dep |
| Snapshot stored inline in journal | `kind = 'file_write'`, payload has `{ path, before, after }` |
| Promotion at session end | `endSession(promote: true)` → walk journal → extract facts → Tier 2 via `MemoryIsolationService` |

---

## 3. Data Model

### `session_events` (replaces both Drizzle tables)

```sql
CREATE TABLE IF NOT EXISTS session_events (
  id         TEXT    PRIMARY KEY,
  session_id TEXT    NOT NULL,
  kind       TEXT    NOT NULL,   -- see EventKind enum below
  payload    TEXT    NOT NULL,   -- JSON string
  ts         INTEGER NOT NULL    -- Date.now()
);

-- Index for fast session reads
CREATE INDEX IF NOT EXISTS idx_session_events_session_id
  ON session_events (session_id, ts DESC);
```

### EventKind enum

```typescript
export type SessionEventKind =
  | 'session_start'        // { agentName, task }
  | 'session_end'          // { promoted: boolean }
  | 'tool_call'            // { tool, args, result, durationMs }
  | 'file_write'           // { path, before: string|null, after: string, agentName }
  | 'file_delete'          // { path, before: string }
  | 'bash_exec'            // { command, output, exitCode }
  | 'agent_message'        // { role: 'user'|'assistant', content }
  | 'checkpoint_created'   // { checkpointId, label, files: string[] }
```

---

## 4. SessionStore API

```typescript
class SessionStore {
  // ── Lifecycle ──────────────────────────────────────────────────────────────
  startSession(agentName: string, task: string): string          // returns sessionId
  endSession(sessionId: string, promote?: boolean): Promise<void>
  getActiveSession(): ActiveSession | null

  // ── Recording (called by tools) ───────────────────────────────────────────
  recordFileWrite(opts: {
    sessionId: string
    path: string
    before: string | null   // null = new file
    after: string
    agentName: string
  }): string                                                      // returns eventId

  recordToolExecution(opts: {
    sessionId: string
    tool: string
    args: Record<string, unknown>
    result: string
    durationMs: number
  }): void

  recordBashExec(opts: {
    sessionId: string
    command: string
    output: string
    exitCode: number
  }): void

  // ── Reading (called by CheckpointService + MemoryService) ─────────────────
  getFileWriteEvents(sessionId: string): FileWriteEvent[]        // ordered by ts
  getToolHistory(sessionId: string, limit?: number): ToolCallEvent[]
  getSessionJournal(sessionId: string): SessionEvent[]           // all events
  getContextSummary(sessionId: string): SessionContextSummary    // for LLM context

  // ── Checkpoint integration ────────────────────────────────────────────────
  snapshotBeforeWrite(sessionId: string, path: string): string   // reads file, stores snapshot, returns eventId
}
```

### `SessionContextSummary` (injected into every LLM turn as Tier 1 context)

```typescript
interface SessionContextSummary {
  sessionId: string
  agentName: string
  task: string
  filesModified: string[]          // paths written this session
  toolCallCount: number
  recentTools: string[]            // last 5 tool names
  sessionAgeMs: number
}
```

Format for LLM:
```
[SESSION CONTEXT]
Agent: CodeSmith | Task: fix retry logic in PipelineRunner
Modified: src/orchestration/PipelineRunner.ts, src/tests/pipeline.test.ts
Tools used: write_file(×3) edit_file(×1) bash(×2)
```

---

## 5. Files to Create

### `packages/loom-memory/src/tier1/SessionStore.ts`

The core class. Uses `better-sqlite3` directly with prepared statements.

```typescript
import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { injectable } from 'inversify'
import { randomUUID } from 'node:crypto'

@injectable()
export class SessionStore {
  private db!: Database.Database
  private stmtInsert!: Database.Statement
  private stmtQuery!: Database.Statement
  private hotLayer: Map<string, ActiveSession> = new Map()
  private dataDir: string = ''

  initialize(dataDir: string): void {
    this.dataDir = dataDir
    fs.mkdirSync(dataDir, { recursive: true })
    this.db = new Database(path.join(dataDir, 'tier1.db'))
    this.db.pragma('journal_mode = WAL')     // non-blocking concurrent reads
    this.db.pragma('synchronous = NORMAL')   // safe + fast

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id         TEXT    PRIMARY KEY,
        session_id TEXT    NOT NULL,
        kind       TEXT    NOT NULL,
        payload    TEXT    NOT NULL,
        ts         INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_se_sid ON session_events (session_id, ts DESC);
    `)

    this.stmtInsert = this.db.prepare(
      'INSERT INTO session_events (id, session_id, kind, payload, ts) VALUES (?,?,?,?,?)'
    )
    this.stmtQuery = this.db.prepare(
      'SELECT * FROM session_events WHERE session_id = ? ORDER BY ts ASC'
    )
  }

  // ... (full implementation in Phase 1)
}
```

### `packages/loom-memory/src/tier1/session-events.schema.ts`

Replaces `session.schema.ts`. No Drizzle import — just TypeScript types matching the SQLite table.

```typescript
// Plain TypeScript types for session_events rows.
// No ORM — better-sqlite3 handles the schema directly in SessionStore.ts.

export type SessionEventKind =
  | 'session_start' | 'session_end'
  | 'tool_call' | 'file_write' | 'file_delete'
  | 'bash_exec' | 'agent_message' | 'checkpoint_created'

export interface RawSessionEvent {
  id: string
  session_id: string
  kind: SessionEventKind
  payload: string    // JSON
  ts: number
}

export interface ActiveSession {
  sessionId: string
  agentName: string
  task: string
  startedAt: number
  filesModified: Set<string>
  toolCallCount: number
}

// Typed payload shapes

export interface FileWritePayload {
  path: string
  before: string | null
  after: string
  agentName: string
}

export interface ToolCallPayload {
  tool: string
  args: Record<string, unknown>
  result: string
  durationMs: number
}

export interface CheckpointCreatedPayload {
  checkpointId: string
  label: string
  files: string[]
}
```

### `packages/loom-core/src/checkpoints/CheckpointService.ts`

Reads `SessionStore.getFileWriteEvents()`, assembles checkpoint records, writes to `.loom/checkpoints/`.

```typescript
export interface CheckpointRecord {
  id: string
  sessionId: string
  agentName: string
  label: string           // "CodeSmith · fixed retry throw"
  timestamp: number
  files: Array<{
    path: string
    before: string | null
    after: string
  }>
}

@injectable()
export class CheckpointService {
  // Called by WriteFileTool BEFORE writing — captures before-state
  async beforeAgentWrite(sessionId: string, filePath: string): Promise<string>

  // Called by WriteFileTool AFTER writing — completes checkpoint with after-state
  async afterAgentWrite(sessionId: string, checkpointId: string, filePath: string, newContent: string): Promise<void>

  // Restore: writes all `before` snapshots back to disk
  async restoreCheckpoint(checkpointId: string): Promise<void>

  // List checkpoints for session (for UI)
  getCheckpoints(sessionId?: string): CheckpointRecord[]

  // Clear session checkpoints
  clearSession(sessionId: string): void
}
```

### `packages/loom-core/src/checkpoints/CheckpointStore.ts`

Thin persistence layer. Writes NDJSON to `.loom/checkpoints/{date}.ndjson`. Each line is one `CheckpointRecord`.

```typescript
export class CheckpointStore {
  private checkpointDir: string

  constructor(workspaceRoot: string) {
    this.checkpointDir = path.join(workspaceRoot, '.loom', 'checkpoints')
    fs.mkdirSync(this.checkpointDir, { recursive: true })
  }

  append(record: CheckpointRecord): void     // sync append — one line of NDJSON
  readToday(): CheckpointRecord[]            // read today's file
  readAll(): CheckpointRecord[]              // read all files (last 7 days)
  delete(checkpointId: string): void
}
```

---

## 6. Files to Modify

### `packages/loom-tools/src/file-ops/write-file.tool.ts`

Inject `SessionStore` and `CheckpointService`. Before writing: snapshot. After writing: complete checkpoint.

```typescript
@injectable()
export class WriteFileTool implements ToolProvider {
  constructor(
    @inject('SessionStore') private sessionStore: SessionStore,
    @inject('CheckpointService') private checkpointService: CheckpointService,
  ) {}

  getTool(): ToolRequest {
    return {
      handler: async (arg_string: string, ctx?: ToolInvocationContext) => {
        const args = JSON.parse(arg_string) as { path: string; content: string }
        const fullPath = path.resolve(args.path)
        const sessionId = ctx?.sessionId ?? 'anon'
        const agentName = ctx?.agentName ?? 'unknown'

        // 1. Read before-state (null if new file)
        let before: string | null = null
        try { before = await fs.readFile(fullPath, 'utf-8') } catch { /* new file */ }

        // 2. Record in SessionStore (Tier 1)
        this.sessionStore.recordFileWrite({ sessionId, path: fullPath, before, after: args.content, agentName })

        // 3. Write the file
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, args.content, 'utf-8')

        // 4. Record checkpoint
        await this.checkpointService.afterAgentWrite(sessionId, fullPath, before, args.content, agentName)

        return { result: `File written: ${args.path}` }
      }
    }
  }
}
```

### `packages/loom-tools/src/file-ops/edit-file.tool.ts`

Same pattern — read before-state, record in SessionStore, edit, record checkpoint.

### `packages/loom-memory/src/MemoryService.ts`

- Remove fake Drizzle `initTier2()` that never ran
- Inject `SessionStore`
- In `formatForContext()`: prepend Tier 1 summary from `sessionStore.getContextSummary()`

```typescript
async formatForContext(task: string, budget: number): Promise<string> {
  const parts: string[] = []

  // Tier 1: current session context (fast, always available)
  const session = this.sessionStore.getActiveSession()
  if (session) {
    parts.push(this.sessionStore.getContextSummary(session.sessionId).toLLMString())
  }

  // Tier 2+3: relevant long-term memories
  const relevant = await this.searchRelevant(task, { limit: 4 })
  if (relevant.length > 0) {
    const memLines = relevant.map(({ memory }) =>
      `- ${memory.key}: ${memory.content.slice(0, 80)}`
    )
    parts.push(`[MEMORY]\n${memLines.join('\n')}`)
  }

  return parts.join('\n\n')
}
```

### `packages/loom-memory/src/MemoryIsolationService.ts`

- Replace `Map<string, SessionMemory>` hot layer with `SessionStore` queries
- `createSession()` → calls `sessionStore.startSession()`
- `approveSession()` → calls `sessionStore.endSession(id, promote: true)`
- `cleanupExpiredSessions()` → queries SQLite journal for sessions older than 24h

### `packages/loom-memory/src/loom-memory-module.ts`

Add `SessionStore` binding:

```typescript
export const MEMORY_TYPES = {
  MemoryService: 'MemoryService',
  MemoryIsolationService: 'MemoryIsolationService',
  SessionStore: 'SessionStore',              // ← new
} as const

export default new ContainerModule((bind) => {
  bind(MEMORY_TYPES.SessionStore).to(SessionStore).inSingletonScope()
  bind(MEMORY_TYPES.MemoryService).to(MemoryService).inSingletonScope()
  bind(MEMORY_TYPES.MemoryIsolationService).to(MemoryIsolationService).inSingletonScope()
})
```

### `packages/loom-core/src/loom-core-module.ts`

Add `CheckpointService` and `CheckpointStore`:

```typescript
export const TYPES = {
  ...existing,
  CheckpointService: Symbol.for('CheckpointService'),
  CheckpointStore:   Symbol.for('CheckpointStore'),
} as const

// in ContainerModule:
bind(TYPES.CheckpointService).to(CheckpointService).inSingletonScope()
bind(TYPES.CheckpointStore).to(CheckpointStore).inSingletonScope()
```

### `packages/loom-tools/src/loom-tools-module.ts`

No binding changes needed — `WriteFileTool` and `EditFileTool` will have `@inject` decorators for `SessionStore` and `CheckpointService`. Inversify resolves them from the shared container at runtime.

---

## 7. Files to Delete

| File | Reason |
|------|--------|
| `packages/loom-memory/src/tier1/session.schema.ts` | Drizzle schema for OpenCode — replaced by `session-events.schema.ts` |

---

## 8. Implementation Phases

### Phase A — SessionStore (Tier 1 foundation)
1. Delete `tier1/session.schema.ts`
2. Create `tier1/session-events.schema.ts` (types only, no ORM)
3. Create `tier1/SessionStore.ts` (better-sqlite3 journal + hot Map)
4. Register `SessionStore` in `loom-memory-module.ts`
5. Update `MemoryIsolationService` to delegate to `SessionStore`
6. Update `MemoryService.formatForContext()` to include Tier 1 summary
7. Update `loom-memory/src/index.ts` exports

**Test:** Start a session, record 3 tool calls, call `getContextSummary()`, verify LLM string output.

### Phase B — Tool Integration
1. Update `WriteFileTool`: inject `SessionStore` + `CheckpointService`, snapshot before write
2. Update `EditFileTool`: same
3. Update `loom-tools/tsconfig.json` to add `@loom/memory` + `@loom/core` as references
4. Update `loom-tools/package.json` to add `@loom/memory` as dependency

**Test:** Agent calls `write_file` → session journal has `file_write` event with before/after content.

### Phase C — CheckpointService
1. Create `packages/loom-core/src/checkpoints/CheckpointStore.ts`
2. Create `packages/loom-core/src/checkpoints/CheckpointService.ts`
3. Register both in `loom-core-module.ts`
4. Wire `CheckpointService.restoreCheckpoint()` to `FlowTrackingService` (emits `file_edit` event on restore so the timeline updates)

**Test:** Write a file via tool → create checkpoint → corrupt the file → restore checkpoint → verify content is the before-state.

### Phase D — Checkpoint Timeline UI
1. Create `packages/loom-ui/src/widgets/CheckpointTimelineWidget.ts` (extends `LoomBaseWidget`)
2. Create `packages/loom-app/src/frontend/checkpoint-contribution.ts` (registers widget + `Ctrl+Shift+Z`)
3. Add `REVERT_CHECKPOINT` to `LOOM_COMMANDS` in `loom-keybindings.ts`
4. Wire frontend → backend via Theia RPC call to `CheckpointService.restoreCheckpoint()`

**Test:** Run an agent that edits files → open Timeline panel → click Restore on a checkpoint → files revert.

### Phase E — Promotion & Session End
1. Complete `MemoryIsolationService.extractMemoriesFromSession()` with real LLM extraction (Haiku)
2. `endSession(promote: true)` → extract key decisions from journal → write to Tier 2 SQLite
3. UI: end-of-session prompt "Promote memories to long-term storage? [Yes/No]"

---

## 9. Dependency Graph (after changes)

```
loom-tools
  └── @loom/memory (SessionStore)
  └── @loom/core   (CheckpointService)

loom-memory
  └── better-sqlite3 (already present)
  └── @loom/core     (LoomMsgHub, Channel)
  REMOVES: drizzle-orm/sqlite-core

loom-core
  └── better-sqlite3 (add)
  └── @loom/memory   (SessionStore — only for CheckpointService; consider moving CheckpointService to loom-memory to avoid circular dep)
```

> **Circular dep risk:** If `loom-core` depends on `@loom/memory` and `@loom/memory` depends on `@loom/core`, we have a circular. Resolution: move `CheckpointService` + `CheckpointStore` to `packages/loom-memory/src/checkpoints/` instead of `loom-core`. `loom-core` remains the pure orchestration layer.

**Revised package ownership:**

| File | Package |
|------|---------|
| `SessionStore.ts` | `loom-memory` |
| `CheckpointService.ts` | `loom-memory` (not loom-core) |
| `CheckpointStore.ts` | `loom-memory` |
| `CheckpointTimelineWidget.ts` | `loom-ui` |
| `checkpoint-contribution.ts` | `loom-app` |

---

## 10. What Gets Removed from `loom-memory/package.json`

```diff
  "dependencies": {
    "@loom/core": "0.1.0",
    "@loom/graph": "0.1.0",
-   "drizzle-orm": "0.29.3",
    "better-sqlite3": "9.4.3",
    "inversify": "^6.0.1"
  }
```

`drizzle-orm` is the only removal. Everything else stays.

---

## 11. Key Design Rules

1. **SessionStore is always synchronous on reads.** `getContextSummary()` must never be async — it runs on every LLM turn in the hot path. Write journal events synchronously too (`db.prepare(...).run(...)`, not async).

2. **`before` content is captured before the file is opened for write.** Race-condition-free because Node.js is single-threaded.

3. **Checkpoints are immutable after creation.** `CheckpointStore.append()` only. Never update a checkpoint record.

4. **Session IDs come from the agent invocation context (`ToolInvocationContext.sessionId`).** If `ctx` is undefined (bare tool call), use `'anon'` — still journalled, just not promoted.

5. **NDJSON for checkpoints, SQLite for session events.** Checkpoints need to survive app restart (for "restore from yesterday's session" UX). Session events are ephemeral-first, with a 24-hour window before auto-discard.

6. **No WAL file left open on unclean shutdown.** `SessionStore.destroy()` must call `this.db.close()`. Wire to Electron's `before-quit` event in `electron-main.ts`.

---

## 12. Connection to Checkpoint UI (from ROADMAP)

Once Phase C is complete, the UI checkpoint card shape is:

```
┌──────────────────────────────────────────────────────┐
│ ◈  CodeSmith · fixed retry throw · 3 files · 2m ago  │
│    PipelineRunner.ts  +12 -4                         │
│    pipeline.test.ts   +8  -2                         │
│    types.ts           +2  -0                         │
│                                    [Restore]  [Diff] │
└──────────────────────────────────────────────────────┘
```

`CheckpointService.getCheckpoints()` returns `CheckpointRecord[]`. The `CheckpointTimelineWidget` renders one card per record. "Restore" calls `CheckpointService.restoreCheckpoint(id)` which writes all `before` snapshots back and emits `FlowTrackingService.trackEvent('file_edit', ...)` for each file so the flow timeline updates.

---

## 13. Gist Assessment (Karpathy-style Obsidian KB)

**Not suitable for Tier 1.** The gist describes a human-operated knowledge vault — Web Clipper → Python compile → Obsidian wiki → SQLite FTS5 search. It is a *static document accumulation* system with a slow write cycle and a Python toolchain. Its strongest features (BM25 ranking, vault_lint, auto-generated indexes) map most closely to what **Tier 3** (Kuzu graph + `GraphService.query()`) already does for project-level knowledge.

**Could inform Tier 2 search.** The FTS5 + BM25 scoring approach in the gist is cleaner than the current `MemoryService.searchTier2()` keyword-match implementation. Worth adopting for `MemoryService` Tier 2 search in a future pass — replace the current for-loop approach with a proper FTS5 virtual table on the memories table.

**References reviewed for Tier 1 design:**
- [mem0](https://github.com/mem0ai/mem0) — session scoping + extraction API (modelled our `SessionStore` API shape on this)
- [Zep](https://github.com/getzep/zep) — event-sourced session journal concept
- [Memary](https://github.com/kinerjulio8238/memary) — lightweight open agent working memory

---

*Last updated: 2026-04-07*
*Next step: Phase A — implement `SessionStore.ts`*
