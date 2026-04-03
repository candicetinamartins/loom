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

export class MemoryWriteTool {
  readonly name = 'memory_write'
  readonly description = 'Write to Loom memory'

  async execute(input: MemoryWriteInput): Promise<MemoryWriteOutput> {
    // Phase 2: Integrate with MemoryService
    return {
      key: input.key,
      success: true,
    }
  }
}
