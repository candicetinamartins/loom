import { injectable, inject, optional } from 'inversify'
import { LoomMsgHub, Channel } from '@loom/core'
import { SessionStore } from './tier1/SessionStore'
import { MemPalaceService } from './mempalace/MemPalaceService'
import { Tier2MemoryStore } from './tier2/Tier2MemoryStore'
import { MEMORY_TYPES } from './loom-memory-module'

// Avoid circular dependency with @loom/graph
interface GraphService {
  query(cypher: string): Promise<any[]>
}

/**
 * Phase 6 — Three-Tier Memory System
 *
 * Architecture:
 * - Tier 1: Session/ephemeral (SessionStore)
 * - Tier 2: User memory (SQLite with FTS search)
 * - Tier 3: Project memory (Kuzu graph with relationships)
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
  private tier2Ready = false
  private tier2Store: Tier2MemoryStore

  constructor(
    @inject('GraphService') @optional() private readonly graphService: GraphService,
    @inject(LoomMsgHub) @optional() private hub: LoomMsgHub,
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore: SessionStore,
    @inject(MEMORY_TYPES.MemPalaceService) @optional() private memPalaceService: MemPalaceService,
  ) {
    this.tier2Store = new Tier2MemoryStore()
  }

  async initialize(): Promise<void> {
    // Initialize Tier 2 SQLite
    await this.tier2Store.initialize()
    this.tier2Ready = true
    
    // Tier 3 ready when graph service is available
    const tier3Ready = !!this.graphService
    
    console.log(`[MemoryService] Initialized - Tier 2 (SQLite): ${this.tier2Ready}, Tier 3 (Graph): ${tier3Ready}`)
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

    // Also store in vector DB for semantic search if available
    if (this.memPalaceService) {
      try {
        await this.memPalaceService.storeMemory(memory)
      } catch {
        // Vector DB optional
      }
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.MEMORY_STORED, {
        memoryId: memory.id,
        key: memory.key,
        tier: memory.tier,
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
      await this.tier2Store.incrementUseCount(tier2.id)
      return tier2
    }

    // Check Tier 3 (graph)
    const tier3 = await this.getTier3(key)
    if (tier3) {
      await this.incrementUseCountGraph(tier3.id)
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
   * Tier 2: Full-text search via SQLite FTS
   * Tier 3: MemPalace vector search (or keyword fallback)
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
   * Format memories for agent context injection.
   * Always starts with Tier 1 (current session summary) for zero-latency context.
   * Then appends Tier 2/3 relevant long-term memories if available.
   */
  async formatForContext(
    taskDescription: string,
    _budget: number
  ): Promise<string> {
    const parts: string[] = []

    // ── Tier 1: current session context (synchronous, always fast) ───────────
    if (this.sessionStore) {
      const activeSession = this.sessionStore.getActiveSession()
      if (activeSession) {
        const t1 = this.sessionStore.formatContextForLLM(activeSession.sessionId)
        if (t1) parts.push(t1)
      }
    }

    // ── Tier 2/3: relevant long-term memories (async, may be unavailable) ────
    // Try MemPalace first (vector semantic search), fall back to Tier 2 search
    let memPalaceContext = ''
    if (this.memPalaceService) {
      try {
        memPalaceContext = await this.memPalaceService.queryForContext(taskDescription)
      } catch {
        // MemPalace unavailable — continue to fallback
      }
    }
    
    if (memPalaceContext) {
      parts.push(memPalaceContext)
    } else if (this.tier2Ready) {
      // Fallback to Tier 2 full-text search
      try {
        const relevant = await this.searchRelevant(taskDescription, { limit: 4 })
        if (relevant.length > 0) {
          const memLines = relevant.map(({ memory }) => {
            const age = this.formatAge(memory.createdAt)
            return `- ${memory.key}: ${memory.content.slice(0, 100)}${memory.content.length > 100 ? '...' : ''} (${age})`
          })
          parts.push(`[MEMORY]\n${memLines.join('\n')}`)
        }
      } catch {
        // Tier 2 unavailable — skip gracefully
      }
    }

    return parts.join('\n\n')
  }

  // Tier 2: SQLite Implementation

  private async storeTier2(memory: Memory): Promise<void> {
    await this.tier2Store.store({
      id: memory.id,
      key: memory.key,
      content: memory.content,
      tier: memory.tier,
      source: memory.source,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
      useCount: memory.useCount,
      sessionId: memory.sessionId,
      agentName: memory.agentName,
      embedding: memory.embedding,
    })
  }

  private async getTier2(key: string): Promise<Memory | null> {
    const row = await this.tier2Store.getByKey(key, 2)
    if (!row) return null
    return this.parseMemoryRow(row)
  }

  private async getAllTier2(options: { source?: string; limit: number }): Promise<Memory[]> {
    const rows = await this.tier2Store.getAll({ tier: 2, source: options.source, limit: options.limit })
    return rows.map(r => this.parseMemoryRow(r))
  }

  private async searchTier2(query: string, limit: number): Promise<MemorySearchResult[]> {
    const rows = await this.tier2Store.search(query, limit)
    return rows.map((row, index) => ({
      memory: this.parseMemoryRow(row),
      relevance: 1.0 - (index * 0.1),
    }))
  }

  private async deleteTier2(key: string): Promise<boolean> {
    return await this.tier2Store.delete(key, 2)
  }

  // Tier 3: Kuzu Graph Implementation

  private async storeTier3(memory: Memory): Promise<void> {
    if (!this.graphService) {
      await this.storeTier2(memory)
      return
    }

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
        key: '${this.escape(memory.key)}',
        content: '${this.escape(memory.content)}',
        tier: ${memory.tier},
        source: '${memory.source}',
        createdAt: timestamp('${memory.createdAt.toISOString()}'),
        updatedAt: timestamp('${memory.updatedAt.toISOString()}'),
        useCount: ${memory.useCount},
        sessionId: '${memory.sessionId || ''}',
        agentName: '${memory.agentName || ''}'
      })
    `)

    await this.createMemoryRelationships(memory)
  }

  private async createMemoryRelationships(memory: Memory): Promise<void> {
    if (!this.graphService) return

    const fileRefs = this.extractFileReferences(memory.content)
    const moduleRefs = this.extractModuleReferences(memory.content)

    for (const fileRef of fileRefs) {
      try {
        await this.graphService.query(`
          MATCH (m:Memory {id: '${memory.id}'}), (f:File {path: '${this.escape(fileRef)}'})
          CREATE (m)-[:RELATES_TO {type: 'file_reference'}]->(f)
        `)
      } catch {}
    }

    for (const moduleRef of moduleRefs) {
      try {
        await this.graphService.query(`
          MATCH (m:Memory {id: '${memory.id}'}), (mod:Module {name: '${this.escape(moduleRef)}'})
          CREATE (m)-[:RELATES_TO {type: 'module_reference'}]->(mod)
        `)
      } catch {}
    }

    if (memory.sessionId) {
      try {
        await this.graphService.query(`
          MATCH (m:Memory {id: '${memory.id}'}), (s:Session {id: '${memory.sessionId}'})
          CREATE (m)-[:SESSION_SOURCE]->(s)
        `)
      } catch {}
    }
  }

  private extractFileReferences(content: string): string[] {
    const matches = content.match(/(?:\/?[\w.-]+\/)+[\w.-]+\.[\w]+/g) || []
    return [...new Set(matches)]
  }

  private extractModuleReferences(content: string): string[] {
    const importMatches = content.match(/from ['"]([@\w/-]+)['"]/g) || []
    const requireMatches = content.match(/require\(['"]([@\w/-]+)['"]\)/g) || []
    
    const modules = new Set<string>()
    
    for (const match of importMatches) {
      const mod = match.match(/from ['"]([@\w/-]+)['"]/)?.[1]
      if (mod) modules.add(mod)
    }
    
    for (const match of requireMatches) {
      const mod = match.match(/require\(['"]([@\w/-]+)['"]\)/)?.[1]
      if (mod) modules.add(mod)
    }
    
    return [...modules]
  }

  private escape(str: string): string {
    return str.replace(/'/g, "''")
  }

  private async getTier3(key: string): Promise<Memory | null> {
    if (!this.graphService) return null

    const result = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${this.escape(key)}' AND m.tier = 3
      RETURN m
      LIMIT 1
    `)

    if (result.length === 0) return null
    return this.parseMemoryNode(result[0].m)
  }

  private async getAllTier3(options: { source?: string; limit: number }): Promise<Memory[]> {
    if (!this.graphService) return []

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
    // Try MemPalace vector search first
    if (this.memPalaceService) {
      try {
        const results = await this.memPalaceService.search(query, { limit })
        return results.map(r => ({
          memory: {
            id: r.id,
            key: String(r.metadata?.key || 'memory'),
            content: r.content,
            tier: 3,
            source: String(r.metadata?.source || 'extracted') as 'explicit' | 'extracted' | 'decision',
            createdAt: new Date(r.timestamp),
            updatedAt: new Date(r.timestamp),
            useCount: 0,
            agentName: String(r.wing || ''),
            sessionId: r.metadata?.session_id as string | undefined,
          },
          relevance: r.score,
        }))
      } catch {
        // Fall back to keyword search
      }
    }

    // Fallback: keyword search via graph
    if (this.graphService) {
      const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 2)
      if (keywords.length === 0) return []

      const pattern = keywords.join('|')
      const result = await this.graphService.query(`
        MATCH (m:Memory)
        WHERE m.tier = 3 AND (m.content =~ '(?i).*(${pattern}).*' OR m.key =~ '(?i).*(${pattern}).*')
        RETURN m
        LIMIT ${limit}
      `)

      return result.map((r: any, index: number) => ({
        memory: this.parseMemoryNode(r.m),
        relevance: 0.7 - (index * 0.1),
      }))
    }

    return []
  }

  private async deleteTier3(key: string): Promise<boolean> {
    if (!this.graphService) return false

    await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${this.escape(key)}' AND m.tier = 3
      DETACH DELETE m
    `)
    return true
  }

  // Helpers

  private parseMemoryRow(row: any): Memory {
    return {
      id: row.id,
      key: row.key,
      content: row.content,
      tier: row.tier as 2 | 3,
      source: row.source as 'explicit' | 'extracted' | 'decision',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      useCount: row.use_count,
      sessionId: row.session_id || undefined,
      agentName: row.agent_name || undefined,
      embedding: row.embedding ? JSON.parse(row.embedding) : undefined,
    }
  }

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

  private async incrementUseCountGraph(memoryId: string): Promise<void> {
    if (!this.graphService) return
    
    await this.graphService.query(`
      MATCH (m:Memory {id: '${memoryId}'})
      SET m.useCount = m.useCount + 1
    `)
  }

  // Helpers

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
