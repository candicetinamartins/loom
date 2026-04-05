import { injectable, inject } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'

// Avoid circular dependency with @loom/memory
interface MemoryService {
  get(key: string): Promise<{ key: string; content: string; tier: number; useCount: number } | null>
  searchRelevant(key: string, options: { limit: number }): Promise<{ memory: { key: string; content: string } }[]>
}

@injectable()
export class MemoryContextProvider implements ContextProvider {
  readonly type = 'memory'
  readonly prefix = 'memory:'

  constructor(
    @inject('MemoryService') private memoryService: MemoryService,
  ) {}

  async provideContext(mention: string): Promise<MentionContext> {
    const key = mention.substring(this.prefix.length)

    try {
      // Search for memory by key
      const memory = await this.memoryService.get(key)
      
      if (!memory) {
        // Try searching relevant memories
        const relevant = await this.memoryService.searchRelevant(key, { limit: 3 })
        if (relevant.length === 0) {
          return {
            type: this.type,
            content: `No memory found for key: ${key}`,
            tokens: 10,
          }
        }

        const content = `[MEMORIES matching "${key}"]\n${relevant.map((r: { memory: { key: string; content: string } }) => `- ${r.memory.key}: ${r.memory.content.slice(0, 100)}`).join('\n')}`
        return {
          type: this.type,
          content,
          tokens: Math.ceil(content.length / 4),
        }
      }

      const content = `[MEMORY: ${memory.key}]\n${memory.content}\n(Tier ${memory.tier}, used ${memory.useCount} times)`

      return {
        type: this.type,
        content,
        tokens: Math.ceil(content.length / 4),
      }
    } catch (error) {
      return {
        type: this.type,
        content: `Memory lookup error: ${error instanceof Error ? error.message : String(error)}`,
        tokens: 10,
      }
    }
  }
}
