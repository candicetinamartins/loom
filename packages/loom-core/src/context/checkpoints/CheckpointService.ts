import { injectable } from 'inversify'

export interface Checkpoint {
  id: string
  agentName: string
  timestamp: Date
  filesModified: string[]
  description?: string
  fileContents?: Map<string, string> // Snapshot of file contents at checkpoint
}

@injectable()
export class CheckpointService {
  private checkpoints: Checkpoint[] = []

  async getCheckpoints(): Promise<Checkpoint[]> {
    return this.checkpoints
  }

  async getCheckpointDiff(checkpointId: string): Promise<string | null> {
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId)
    if (!checkpoint) {
      return null
    }

    // Build diff report
    const lines: string[] = [
      `Checkpoint: ${checkpoint.id}`,
      `Agent: ${checkpoint.agentName}`,
      `Time: ${checkpoint.timestamp.toISOString()}`,
      `Description: ${checkpoint.description || 'No description'}`,
      '',
      'Files Modified:',
      ...checkpoint.filesModified.map(f => `  - ${f}`),
    ]

    // If we have file contents snapshot, include them
    if (checkpoint.fileContents && checkpoint.fileContents.size > 0) {
      lines.push('', 'File Snapshots:')
      for (const [path, content] of checkpoint.fileContents) {
        lines.push(`\n--- ${path} ---`)
        lines.push(content.slice(0, 1000)) // Limit content
      }
    }

    return lines.join('\n')
  }

  async createCheckpoint(checkpoint: Omit<Checkpoint, 'id' | 'timestamp' | 'fileContents'>): Promise<Checkpoint> {
    const cp: Checkpoint = {
      ...checkpoint,
      id: `cp-${Date.now()}`,
      timestamp: new Date(),
    }
    this.checkpoints.push(cp)
    return cp
  }

  async restoreCheckpoint(checkpointId: string): Promise<boolean> {
    const checkpoint = this.checkpoints.find(cp => cp.id === checkpointId)
    if (!checkpoint) {
      return false
    }

    // File restoration is handled by the CheckpointRestoreTool
    // which has access to the FileService
    console.log(`[CheckpointService] Restore requested for ${checkpointId} - ${checkpoint.filesModified.length} files`)

    return true
  }
}
