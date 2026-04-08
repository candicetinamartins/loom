import { injectable, inject, optional } from 'inversify'

// Local interface to avoid circular dependency with @loom/memory
interface MemorySearchResult {
  memory: {
    key: string
    content: unknown
  }
}

interface MemoryServiceInterface {
  searchRelevant(query: string, limit: number): Promise<MemorySearchResult[]>
}

export interface MemoryReadInput {
  key: string
  scope?: 'session' | 'project' | 'global'
}

export interface MemoryReadOutput {
  key: string
  value: unknown | null
  found: boolean
}

@injectable()
export class MemoryReadTool {
  readonly name = 'memory_read'
  readonly description = 'Read from Loom memory by key'

  constructor(
    @inject('MemoryService') @optional() private memoryService?: MemoryServiceInterface,
  ) {}

  async execute(input: MemoryReadInput): Promise<MemoryReadOutput> {
    if (!this.memoryService) {
      return {
        key: input.key,
        value: null,
        found: false,
      }
    }

    // Search for memory by key using the Working Graph
    const results = await this.memoryService.searchRelevant(input.key, 5)
    const match = results.find((r: MemorySearchResult) => r.memory.key === input.key)

    if (match) {
      return {
        key: input.key,
        value: match.memory.content,
        found: true,
      }
    }

    return {
      key: input.key,
      value: null,
      found: false,
    }
  }
}
