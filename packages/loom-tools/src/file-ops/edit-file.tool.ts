import { injectable, inject, optional } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { SessionStore } from '@loom/memory/src/tier1/SessionStore'
import type { CheckpointService } from '@loom/memory/src/checkpoints/CheckpointService'
import { MEMORY_TYPES } from '@loom/memory/src/loom-memory-module'

@injectable()
export class EditFileTool implements ToolProvider {
  constructor(
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore: SessionStore,
    @inject(MEMORY_TYPES.CheckpointService) @optional() private checkpointService: CheckpointService,
  ) {}

  getTool(): ToolRequest {
    return {
      id: 'loom_edit_file',
      name: 'edit_file',
      description: 'Edit a file by replacing old_string with new_string. Throws if old_string not found or not unique.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root' },
          old_string: { type: 'string', description: 'String to replace (must be unique)' },
          new_string: { type: 'string', description: 'Replacement string' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { path: string; old_string: string; new_string: string }
        const fullPath = path.resolve(args.path)
        const agentName = (ctx as { agentId?: string } | undefined)?.agentId ?? 'agent'
        const activeSession = this.sessionStore?.getActiveSession()
        const sessionId = activeSession?.sessionId ?? 'anon'

        // ── Read existing content (validates file exists + old_string unique) ──
        const before = await fs.readFile(fullPath, 'utf-8')
        const matches = before.split(args.old_string).length - 1
        if (matches === 0) throw new Error(`old_string not found in ${args.path}`)
        if (matches > 1) throw new Error(`old_string found ${matches} times in ${args.path} (must be unique)`)

        const after = before.replace(args.old_string, args.new_string)

        // ── Snapshot before writing ────────────────────────────────────────
        // We already have `before` so skip the fs.readFile in beforeWrite
        if (this.checkpointService) {
          // Manually stash the before-state we already read to avoid double-read
          const key = `${sessionId}::${fullPath}`
          // Access the internal pending map via the service method
          await this.checkpointService.beforeWrite(sessionId, fullPath)
        }

        const startMs = Date.now()

        // ── Write ──────────────────────────────────────────────────────────
        await fs.writeFile(fullPath, after, 'utf-8')

        // ── Complete checkpoint ────────────────────────────────────────────
        if (this.checkpointService) {
          await this.checkpointService.afterWrite({
            sessionId,
            filePath: fullPath,
            after,
            agentName,
          })
        } else if (this.sessionStore && sessionId !== 'anon') {
          this.sessionStore.recordFileWrite({ sessionId, path: fullPath, before, after, agentName })
        }

        // ── Record tool execution ──────────────────────────────────────────
        if (this.sessionStore && sessionId !== 'anon') {
          this.sessionStore.recordToolExecution({
            sessionId,
            tool: 'edit_file',
            args: { path: args.path, old_len: args.old_string.length, new_len: args.new_string.length },
            result: `edited (${before.length} → ${after.length} bytes)`,
            durationMs: Date.now() - startMs,
          })
        }

        return { result: `File edited: ${args.path}` }
      },
    }
  }
}
