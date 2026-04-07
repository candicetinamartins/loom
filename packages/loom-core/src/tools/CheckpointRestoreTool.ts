/**
 * CheckpointRestoreTool — restores all files in a checkpoint to their before-state.
 *
 * Delegates to CheckpointService.restoreCheckpoint() in @loom/memory.
 * The NDJSON store is read synchronously; each file's `before` content is written
 * back to disk. New files (before = null) are deleted.
 */

export interface CheckpointRestoreInput {
  checkpointId: string
}

export interface CheckpointRestoreOutput {
  id: string
  success: boolean
  restoredFiles: string[]
  error?: string
}

export class CheckpointRestoreTool {
  readonly name = 'checkpoint_restore'
  readonly description =
    'Restore all files to their state before a specific checkpoint. ' +
    'Use checkpointId from the timeline panel or checkpoint_create output. ' +
    'This overwrites current file contents — make sure you want to revert.'

  async execute(input: CheckpointRestoreInput): Promise<CheckpointRestoreOutput> {
    try {
      // Dynamic require to avoid compile-time circular dep loom-core → loom-memory
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const memoryModule = require('@loom/memory') as any
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const CheckpointStoreClass = memoryModule.CheckpointStore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      const store = new CheckpointStoreClass(process.env.THEIA_APP_PROJECT_PATH ?? process.cwd())
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const record = store.findById(input.checkpointId)

      if (!record) {
        throw new Error(`Checkpoint not found: ${input.checkpointId}`)
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsSync = require('node:fs/promises') as typeof import('node:fs/promises')
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('node:path') as typeof import('node:path')

      const restored: string[] = []
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      for (const file of record.files as Array<{ path: string; before: string | null }>) {
        if (file.before === null) {
          try { await fsSync.unlink(file.path) } catch { /* already gone */ }
        } else {
          await fsSync.mkdir(path.dirname(file.path), { recursive: true })
          await fsSync.writeFile(file.path, file.before, 'utf-8')
        }
        restored.push(file.path)
      }

      console.log(`[CheckpointRestoreTool] Restored ${restored.length} files from ${input.checkpointId}`)
      return { id: input.checkpointId, success: true, restoredFiles: restored }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error('[CheckpointRestoreTool] Restore failed:', msg)
      return { id: input.checkpointId, success: false, restoredFiles: [], error: msg }
    }
  }
}
