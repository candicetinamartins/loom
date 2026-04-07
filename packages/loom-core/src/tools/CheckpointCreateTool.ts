import { injectable, inject } from 'inversify'
import { MEMORY_TYPES } from '@loom/memory/src/loom-memory-module'
import type { CheckpointService } from '@loom/memory/src/checkpoints/CheckpointService'
import type { SessionStore } from '@loom/memory/src/tier1/SessionStore'

/**
 * CheckpointCreateTool — agent-callable tool to explicitly create a named checkpoint.
 *
 * Normally checkpoints are auto-created by WriteFileTool / EditFileTool on every
 * agent write. This tool lets an agent explicitly mark a checkpoint with a name
 * (e.g. "before_refactor", "after_tests_pass") so it is easy to find in the timeline.
 */

export interface CheckpointCreateInput {
  name: string
  description?: string
}

export interface CheckpointCreateOutput {
  id: string
  name: string
  timestamp: number
  success: boolean
}

@injectable()
export class CheckpointCreateTool {
  readonly name = 'checkpoint_create'
  readonly description =
    'Create a named checkpoint of the current session state. ' +
    'Snapshots all files modified so far in this session. ' +
    'Use before risky refactors or large rewrites.'

  constructor(
    @inject(MEMORY_TYPES.CheckpointService) private checkpointService: CheckpointService,
    @inject(MEMORY_TYPES.SessionStore) private sessionStore: SessionStore,
  ) {}

  async execute(input: CheckpointCreateInput): Promise<CheckpointCreateOutput> {
    const session = this.sessionStore.getActiveSession()
    if (!session) {
      throw new Error('No active session - cannot create checkpoint')
    }

    const record = await this.checkpointService.createNamedCheckpoint({
      sessionId: session.sessionId,
      name: input.name,
      description: input.description,
      agentName: session.agentName,
    })

    return {
      id: record.id,
      name: input.name,
      timestamp: record.timestamp,
      success: true,
    }
  }
}
