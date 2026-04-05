import { injectable, inject } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

// Avoid circular dependency - define local interfaces
interface Checkpoint {
  id: string
  timestamp: Date
  agentName: string
  filesModified: string[]
  description?: string
}

interface CheckpointService {
  getCheckpoints(): Promise<Checkpoint[]>
  getCheckpointDiff(checkpointId: string): Promise<string | null>
}

@injectable()
export class CheckpointContextProvider implements ContextProvider {
  readonly type = 'checkpoint'
  readonly prefix = 'checkpoint:'

  constructor(
    @inject('CheckpointService') private checkpointService: CheckpointService,
  ) {}

  async provideContext(mention: string): Promise<MentionContext> {
    const checkpointId = mention.substring(this.prefix.length)

    try {
      // Get all checkpoints and find the one with matching ID
      const checkpoints = await this.checkpointService.getCheckpoints()
      const checkpoint = checkpoints.find((c: Checkpoint) => c.id === checkpointId)
      
      if (!checkpoint) {
        return {
          type: this.type,
          content: `Checkpoint "${checkpointId}" not found.`,
          tokens: 10,
        }
      }

      // Get diff content for context
      const diffContent = await this.checkpointService.getCheckpointDiff(checkpointId)
      const diffPreview = diffContent ? diffContent.slice(0, 500) : 'No diff available'

      const content = `[CHECKPOINT: ${checkpointId}]
Agent: ${checkpoint.agentName}
Time: ${checkpoint.timestamp.toISOString()}
Files: ${checkpoint.filesModified.join(', ')}
Description: ${checkpoint.description || 'No description'}

Diff Preview:
${diffPreview}${diffContent && diffContent.length > 500 ? '...' : ''}`

      return {
        type: this.type,
        content,
        tokens: Math.ceil(content.length / 4),
      }
    } catch (error) {
      return {
        type: this.type,
        content: `Checkpoint lookup error: ${error instanceof Error ? error.message : String(error)}`,
        tokens: 10,
      }
    }
  }
}
