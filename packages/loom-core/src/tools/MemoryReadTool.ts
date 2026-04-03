export interface MemoryReadInput {
  key: string
  scope?: 'session' | 'project' | 'global'
}

export interface MemoryReadOutput {
  key: string
  value: unknown | null
  found: boolean
}

export class MemoryReadTool {
  readonly name = 'memory_read'
  readonly description = 'Read from Loom memory'

  async execute(input: MemoryReadInput): Promise<MemoryReadOutput> {
    // Phase 2: Integrate with MemoryService
    return {
      key: input.key,
      value: null,
      found: false,
    }
  }
}
