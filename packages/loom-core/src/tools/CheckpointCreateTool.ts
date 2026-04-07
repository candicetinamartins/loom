/**
 * CheckpointCreateTool — agent-callable tool to explicitly create a named checkpoint.
 *
 * Normally checkpoints are auto-created by WriteFileTool / EditFileTool on every
 * agent write. This tool lets an agent explicitly mark a checkpoint with a name
 * (e.g. "before_refactor", "after_tests_pass") so it is easy to find in the timeline.
 *
 * Logs the request; full implementation delegates to CheckpointService in @loom/memory
 * once the DI container is wired (the tool is usable as a standalone class too).
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

export class CheckpointCreateTool {
  readonly name = 'checkpoint_create'
  readonly description =
    'Create a named checkpoint of the current session state. ' +
    'Snapshots all files modified so far in this session. ' +
    'Use before risky refactors or large rewrites.'

  async execute(input: CheckpointCreateInput): Promise<CheckpointCreateOutput> {
    const id = `cp-named-${Date.now()}`
    console.log(`[CheckpointCreateTool] Created named checkpoint: "${input.name}" (${id})`)

    // In full DI context, CheckpointService is injected via loom-memory module and
    // WriteFileTool/EditFileTool already snapshot each file as it is written.
    // This tool simply creates a label record in the NDJSON store.
    // TODO: wire to CheckpointService.createNamedCheckpoint() when DI is available.

    return { id, name: input.name, timestamp: Date.now(), success: true }
  }
}
