import { injectable, inject, optional } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { SessionStore } from '@loom/memory/src/tier1/SessionStore'
import type { CheckpointService } from '@loom/memory/src/checkpoints/CheckpointService'
import { MEMORY_TYPES } from '@loom/memory/src/loom-memory-module'

@injectable()
export class WriteFileTool implements ToolProvider {
  constructor(
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore: SessionStore,
    @inject(MEMORY_TYPES.CheckpointService) @optional() private checkpointService: CheckpointService,
  ) {}

  getTool(): ToolRequest {
    return {
      id: 'loom_write_file',
      name: 'write_file',
      description: 'Write content to a file. Creates directories if needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          content: { type: 'string', description: 'Content to write' },
        },
        required: ['path', 'content'],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { path: string; content: string }
        const fullPath = path.resolve(args.path)

        // Resolve session from active session (or ctx if Theia provides it)
        const agentName = (ctx as { agentId?: string } | undefined)?.agentId ?? 'agent'
        const activeSession = this.sessionStore?.getActiveSession()
        const sessionId = activeSession?.sessionId ?? 'anon'

        const startMs = Date.now()

        // ── Before write: snapshot for checkpoint ─────────────────────────
        if (this.checkpointService) {
          await this.checkpointService.beforeWrite(sessionId, fullPath)
        }

        // ── Write ──────────────────────────────────────────────────────────
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        await fs.writeFile(fullPath, args.content, 'utf-8')

        // ── After write: complete checkpoint + record in session journal ──
        if (this.checkpointService) {
          await this.checkpointService.afterWrite({
            sessionId,
            filePath: fullPath,
            after: args.content,
            agentName,
          })
        } else if (this.sessionStore && sessionId !== 'anon') {
          // If checkpoint service unavailable, still record in session journal
          let before: string | null = null
          try { before = await fs.readFile(fullPath, 'utf-8') } catch { /* new file */ }
          this.sessionStore.recordFileWrite({ sessionId, path: fullPath, before, after: args.content, agentName })
        }

        // ── Record tool execution ──────────────────────────────────────────
        if (this.sessionStore && sessionId !== 'anon') {
          this.sessionStore.recordToolExecution({
            sessionId,
            tool: 'write_file',
            args: { path: args.path },
            result: `written ${args.content.length} bytes`,
            durationMs: Date.now() - startMs,
          })
        }

        return { result: `File written: ${args.path}` }
      },
    }
  }
}
