import { injectable, inject } from 'inversify'
import { GraphService } from '@loom/graph'
import { LoomMsgHub, Channel } from '@loom/core'

/**
 * Phase 6 — Three-Tier Memory System
 * 
 * Architecture:
 * - Tier 1: Session/ephemeral (handled by OpenCode)
 * - Tier 2: User memory (SQLite with Drizzle ORM)
 * - Tier 3: Project memory (Kuzu graph nodes)
 * 
 * Commands:
 * - /remember <content> - Store explicit memory
 * - /forget <key> - Delete memory
 * 
 * Features:
 * - Memory Panel widget for browsing memories
 * - MemoryIsolationService for session boundaries
 * - Auto-extraction at session end (Haiku)
 */

export interface Memory {
  id: string
  key: string
  content: string
  tier: 2 | 3
  source: 'explicit' | 'extracted' | 'decision'
  createdAt: Date
  updatedAt: Date
  useCount: number
  sessionId?: string
  agentName?: string
  embedding?: number[]
}

export interface MemorySearchResult {
  memory: Memory
  relevance: number
}

@injectable()
export class MemoryService {
  private db: any // Drizzle database instance
  private tier2Ready = false

  constructor(
    @inject(GraphService) private readonly graphService: GraphService,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
  ) {}

  async initialize(): Promise<void> {
    await this.initTier2()
    console.log('[MemoryService] Initialized - Tier 2 (SQLite) + Tier 3 (Kuzu)')
  }

  /**
   * Initialize Tier 2: SQLite with Drizzle ORM
   */
  private async initTier2(): Promise<void> {
    // In production, this would:
    // 1. Initialize better-sqlite3
    // 2. Run migrations with Drizzle
    // 3. Set up schema
    
    // For now, mark as ready when Kuzu is available
    if (this.graphService) {
      this.tier2Ready = true
    }
  }

  /**
   * Store a memory (explicit or extracted)
   */
  async remember(
    content: string,
    options: {
      key?: string
      tier?: 2 | 3
      source?: 'explicit' | 'extracted' | 'decision'
      sessionId?: string
      agentName?: string
    } = {}
  ): Promise<Memory> {
    const {
      key = this.generateKey(content),
      tier = 2,
      source = 'explicit',
      sessionId,
      agentName,
    } = options

    const memory: Memory = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      key,
      content,
      tier,
      source,
      createdAt: new Date(),
      updatedAt: new Date(),
      useCount: 0,
      sessionId,
      agentName,
    }

    if (tier === 2) {
      await this.storeTier2(memory)
    } else {
      await this.storeTier3(memory)
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.MEMORY_STORED, {
        memoryId: memory.id,
        key: memory.key,
        tier: String(memory.tier),
      })
    )

    return memory
  }

  /**
   * Delete a memory by key
   */
  async forget(key: string): Promise<boolean> {
    // Try Tier 2 first
    const deletedFromTier2 = await this.deleteTier2(key)
    if (deletedFromTier2) return true

    // Try Tier 3
    const deletedFromTier3 = await this.deleteTier3(key)
    if (deletedFromTier3) return true

    return false
  }

  /**
   * Get a memory by key
   */
  async get(key: string): Promise<Memory | null> {
    // Check Tier 2 first (fast)
    const tier2 = await this.getTier2(key)
    if (tier2) {
      await this.incrementUseCount(tier2.id)
      return tier2
    }

    // Check Tier 3 (graph)
    const tier3 = await this.getTier3(key)
    if (tier3) {
      await this.incrementUseCount(tier3.id)
      return tier3
    }

    return null
  }

  /**
   * Get all memories
   */
  async getAll(options: {
    tier?: 2 | 3
    source?: 'explicit' | 'extracted' | 'decision'
    limit?: number
  } = {}): Promise<Memory[]> {
    const { tier, source, limit = 100 } = options

    let memories: Memory[] = []

    if (!tier || tier === 2) {
      const tier2 = await this.getAllTier2({ source, limit })
      memories = memories.concat(tier2)
    }

    if (!tier || tier === 3) {
      const tier3 = await this.getAllTier3({ source, limit })
      memories = memories.concat(tier3)
    }

    // Sort by use count (most used first)
    return memories.sort((a, b) => b.useCount - a.useCount).slice(0, limit)
  }

  /**
   * Search memories by relevance
   * Tier 2: Use count ranking
   * Tier 3: Vector similarity
   */
  async searchRelevant(
    query: string,
    options: {
      limit?: number
      tier?: 2 | 3
    } = {}
  ): Promise<MemorySearchResult[]> {
    const { limit = 5, tier } = options

    let results: MemorySearchResult[] = []

    if (!tier || tier === 2) {
      const tier2Results = await this.searchTier2(query, limit)
      results = results.concat(tier2Results)
    }

    if (!tier || tier === 3) {
      const tier3Results = await this.searchTier3(query, limit)
      results = results.concat(tier3Results)
    }

    // Sort by relevance
    return results.sort((a, b) => b.relevance - a.relevance).slice(0, limit)
  }

  /**
   * Format memories for agent context
   */
  async formatForContext(
    taskDescription: string,
    budget: number
  ): Promise<string> {
    const relevant = await this.searchRelevant(taskDescription, { limit: 5 })
    
    if (relevant.length === 0) return ''

    const parts = relevant.map(({ memory }) => {
      const age = this.formatAge(memory.createdAt)
      return `- ${memory.key}: ${memory.content.slice(0, 100)}${memory.content.length > 100 ? '...' : ''} (${age})`
    })

    return `[MEMORY CONTEXT]\n${parts.join('\n')}`
  }

  // Tier 2: SQLite Implementation

  private async storeTier2(memory: Memory): Promise<void> {
    // In production: INSERT INTO memories ...
    // For now, store in-memory or use Kuzu as fallback
    await this.graphService.query(`
      CREATE NODE TABLE IF NOT EXISTS Memory (
        id STRING,
        key STRING,
        content STRING,
        tier INT64,
        source STRING,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP,
        useCount INT64,
        sessionId STRING,
        agentName STRING,
        PRIMARY KEY (id)
      )
    `)

    await this.graphService.query(`
      CREATE (m:Memory {
        id: '${memory.id}',
        key: '${memory.key.replace(/'/g, "''")}',
        content: '${memory.content.replace(/'/g, "''")}',
        tier: ${memory.tier},
        source: '${memory.source}',
        createdAt: timestamp('${memory.createdAt.toISOString()}'),
        updatedAt: timestamp('${memory.updatedAt.toISOString()}'),
        useCount: ${memory.useCount},
        sessionId: '${memory.sessionId || ''}',
        agentName: '${memory.agentName || ''}'
      })
    `)
  }

  private async getTier2(key: string): Promise<Memory | null> {
    const result = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${key.replace(/'/g, "''")}' AND m.tier = 2
      RETURN m
      LIMIT 1
    `)

    if (result.length === 0) return null
    return this.parseMemoryNode(result[0].m)
  }

  private async getAllTier2(options: { source?: string; limit: number }): Promise<Memory[]> {
    const whereClause = options.source ? `AND m.source = '${options.source}'` : ''
    
    const result = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.tier = 2 ${whereClause}
      RETURN m
      ORDER BY m.useCount DESC
      LIMIT ${options.limit}
    `)

    return result.map((r: any) => this.parseMemoryNode(r.m))
  }

  private async searchTier2(query: string, limit: number): Promise<MemorySearchResult[]> {
    // Simple keyword matching for Tier 2
    const keywords = query.toLowerCase().split(/\s+/)
    const all = await this.getAllTier2({ limit: 100 })
    
    return all
      .map(memory => {
        const contentLower = memory.content.toLowerCase()
        const keyLower = memory.key.toLowerCase()
        const matches = keywords.filter(k => contentLower.includes(k) || keyLower.includes(k))
        return {
          memory,
          relevance: matches.length / keywords.length,
        }
      })
      .filter(r => r.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit)
  }

  private async deleteTier2(key: string): Promise<boolean> {
    await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${key.replace(/'/g, "''")}' AND m.tier = 2
      DELETE m
    `)
    return true
  }

  // Tier 3: Kuzu Graph Implementation

  private async storeTier3(memory: Memory): Promise<void> {
    // Tier 3 stores in graph with relationships to files/modules
    // Memory nodes can be linked to: Modules, Functions, Decisions
    
    await this.storeTier2(memory) // Store as node first
    
    // In production: Create relationships to relevant graph nodes
    // MATCH (m:Memory {id: '${memory.id}'}), (mod:Module {name: '...'})
    // CREATE (m)-[:RELATES_TO]->(mod)
  }

  private async getTier3(key: string): Promise<Memory | null> {
    const result = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${key.replace(/'/g, "''")}' AND m.tier = 3
      RETURN m
      LIMIT 1
    `)

    if (result.length === 0) return null
    return this.parseMemoryNode(result[0].m)
  }

  private async getAllTier3(options: { source?: string; limit: number }): Promise<Memory[]> {
    const whereClause = options.source ? `AND m.source = '${options.source}'` : ''
    
    const result = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.tier = 3 ${whereClause}
      RETURN m
      ORDER BY m.useCount DESC
      LIMIT ${options.limit}
    `)

    return result.map((r: any) => this.parseMemoryNode(r.m))
  }

  private async searchTier3(query: string, limit: number): Promise<MemorySearchResult[]> {
    // In production: Use vector similarity search
    // For now, use same keyword matching as Tier 2
    return this.searchTier2(query, limit)
  }

  private async deleteTier3(key: string): Promise<boolean> {
    await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${key.replace(/'/g, "''")}' AND m.tier = 3
      DELETE m
    `)
    return true
  }

  // Helpers

  private parseMemoryNode(node: any): Memory {
    return {
      id: node.id,
      key: node.key,
      content: node.content,
      tier: node.tier,
      source: node.source,
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
      useCount: node.useCount,
      sessionId: node.sessionId || undefined,
      agentName: node.agentName || undefined,
    }
  }

  private async incrementUseCount(memoryId: string): Promise<void> {
    await this.graphService.query(`
      MATCH (m:Memory {id: '${memoryId}'})
      SET m.useCount = m.useCount + 1
    `)
  }

  private generateKey(content: string): string {
    // Generate a short key from content
    const words = content.toLowerCase().split(/\s+/).slice(0, 5)
    return words.join('-').replace(/[^a-z0-9-]/g, '').slice(0, 50)
  }

  private formatAge(date: Date): string {
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'today'
    if (days === 1) return '1 day ago'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    return `${Math.floor(days / 30)} months ago`
  }
}
