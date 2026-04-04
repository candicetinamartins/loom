import { injectable } from 'inversify'

export interface Checkpoint {
  id: string
  agentName: string
  timestamp: Date
  filesModified: string[]
  description?: string
}

@injectable()
export class CheckpointService {
  private checkpoints: Checkpoint[] = []

  async getCheckpoints(): Promise<Checkpoint[]> {
    return this.checkpoints
  }

  async getCheckpointDiff(checkpointId: string): Promise<string | null> {
    return null
  }

  async createCheckpoint(checkpoint: Omit<Checkpoint, 'id' | 'timestamp'>): Promise<Checkpoint> {
    const cp: Checkpoint = {
      ...checkpoint,
      id: `cp-${Date.now()}`,
      timestamp: new Date(),
    }
    this.checkpoints.push(cp)
    return cp
  }
}
