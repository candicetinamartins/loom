import { injectable, inject, optional } from 'inversify'
import { MemoryService } from '@loom/memory'

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
    @inject(MemoryService) @optional() private memoryService?: MemoryService,
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
