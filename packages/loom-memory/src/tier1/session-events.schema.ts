/**
 * Tier 1 Session Events — plain TypeScript types for the session_events SQLite table.
 * No ORM dependency. better-sqlite3 handles DDL directly in SessionStore.
 *
 * Replaces: tier1/session.schema.ts (Drizzle ORM, was OpenCode-dependent)
 */

// ── Event kinds ────────────────────────────────────────────────────────────────

export type SessionEventKind =
  | 'session_start'       // { agentName, task }
  | 'session_end'         // { promoted: boolean }
  | 'tool_call'           // { tool, args, result, durationMs }
  | 'file_write'          // { path, before: string|null, after: string, agentName }
  | 'file_delete'         // { path, before: string }
  | 'bash_exec'           // { command, output, exitCode }
  | 'agent_message'       // { role: 'user'|'assistant', content }
  | 'checkpoint_created'  // { checkpointId, label, files: string[] }

// ── Raw DB row ─────────────────────────────────────────────────────────────────

export interface RawSessionEvent {
  id: string
  session_id: string
  kind: SessionEventKind
  payload: string   // JSON string
  ts: number        // Date.now()
}

// ── Typed payload shapes ───────────────────────────────────────────────────────

export interface SessionStartPayload {
  agentName: string
  task: string
}

export interface SessionEndPayload {
  promoted: boolean
}

export interface ToolCallPayload {
  tool: string
  args: Record<string, unknown>
  result: string
  durationMs: number
}

export interface FileWritePayload {
  path: string
  before: string | null   // null = new file (did not exist before write)
  after: string
  agentName: string
}

export interface FileDeletePayload {
  path: string
  before: string
}

export interface BashExecPayload {
  command: string
  output: string
  exitCode: number
}

export interface AgentMessagePayload {
  role: 'user' | 'assistant'
  content: string
}

export interface CheckpointCreatedPayload {
  checkpointId: string
  label: string
  files: string[]
}

// ── Hot-layer types (in-memory, per session) ──────────────────────────────────

export interface ActiveSession {
  sessionId: string
  agentName: string
  task: string
  startedAt: number
  filesModified: Set<string>
  toolCallCount: number
}

export interface SessionContextSummary {
  sessionId: string
  agentName: string
  task: string
  filesModified: string[]
  toolCallCount: number
  recentTools: string[]
  sessionAgeMs: number
}
