import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * Tier 1 Session State (Ephemeral)
 * 
 * These sessions are cleared on app close.
 * Stored in SQLite for fast access during the session.
 */

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(),
  agentName: text('agent_name').notNull(),
  sessionId: text('session_id').notNull(),
  currentTask: text('current_task'),
  openFiles: text('open_files'),           // JSON array
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

export const toolExecutions = sqliteTable('tool_executions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  toolName: text('tool_name').notNull(),
  args: text('args'),                      // JSON
  result: text('result'),
  executedAt: integer('executed_at').notNull(),
})
