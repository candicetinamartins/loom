import { injectable, inject, optional } from 'inversify'

// Local interface to avoid circular dependency with @loom/memory
interface MemoryEntry {
  key: string
  content: string
  source: string
}

interface MemoryServiceInterface {
  remember(entry: MemoryEntry): Promise<void>
}

export interface MemoryWriteInput {
  key: string
  value: unknown
  scope?: 'session' | 'project' | 'global'
  ttl?: number // seconds
}

export interface MemoryWriteOutput {
  key: string
  success: boolean
}

@injectable()
export class MemoryWriteTool {
  readonly name = 'memory_write'
  readonly description = 'Write to Loom memory'

  constructor(
    @inject('MemoryService') @optional() private memoryService?: MemoryServiceInterface,
  ) {}

  async execute(input: MemoryWriteInput): Promise<MemoryWriteOutput> {
    if (!this.memoryService) {
      return {
        key: input.key,
        success: false,
      }
    }

    try {
      const content = typeof input.value === 'string'
        ? input.value
        : JSON.stringify(input.value)

      await this.memoryService.remember({
        key: input.key,
        content,
        source: 'explicit',
      })

      return {
        key: input.key,
        success: true,
      }
    } catch {
      return {
        key: input.key,
        success: false,
      }
    }
  }
}
