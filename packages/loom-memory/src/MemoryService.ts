import { injectable, inject, optional } from 'inversify'
import { LoomMsgHub, Channel } from '@loom/graph'
import { SessionStore } from './tier1/SessionStore'
import { MEMORY_TYPES } from './loom-memory-module'

// Avoid circular dependency with @loom/graph
interface GraphService {
  query(cypher: string): Promise<any[]>
}

/**
 * Two-Tier Memory System
 *
 * Architecture:
 * - Tier 1: Session/ephemeral (SessionStore) - raw events, temporary
 * - Tier 2: Working Graph (Kuzu) - entities, relationships, summaries
 *
 * At session end, Tier 1 events are walked and meaningful nodes
 * (files modified, functions created, errors fixed) are upserted into the graph.
 *
 * Tier 2 answers richer queries:
 * - "what files does this feature depend on?"
 * - "which agent has touched this module before?"
 */

export interface Memory {
  id: string
  key: string
  content: string
  source: 'explicit' | 'extracted' | 'decision'
  createdAt: Date
  updatedAt: Date
  useCount: number
  sessionId?: string
  agentName?: string
}

export interface MemorySearchResult {
  memory: Memory
  relevance: number
}

export interface FileNode {
  path: string
  lastModified: Date
  agentName?: string
  changeCount: number
}

export interface SymbolNode {
  name: string
  type: 'function' | 'class' | 'variable' | 'other'
  filePath: string
  line?: number
  agentName?: string
}

@injectable()
export class MemoryService {
  private graphReady = false

  constructor(
    @inject('GraphService') @optional() private readonly graphService: GraphService,
    @inject(LoomMsgHub) @optional() private hub: LoomMsgHub,
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore: SessionStore,
  ) {}

  async initialize(): Promise<void> {
    this.graphReady = !!this.graphService

    if (this.graphReady) {
      await this.initializeGraphSchema()
    }

    console.log(`[MemoryService] Initialized - Tier 1 (SessionStore): ${!!this.sessionStore}, Tier 2 (Kuzu Graph): ${this.graphReady}`)
  }

  /**
   * Initialize the Working Graph schema
   */
  private async initializeGraphSchema(): Promise<void> {
    if (!this.graphService) return

    const schemas = [
      `CREATE NODE TABLE IF NOT EXISTS Memory (
        id STRING,
        key STRING,
        content STRING,
        source STRING,
        createdAt TIMESTAMP,
        updatedAt TIMESTAMP,
        useCount INT64,
        sessionId STRING,
        agentName STRING,
        PRIMARY KEY (id)
      )`,
      `CREATE NODE TABLE IF NOT EXISTS File (
        path STRING,
        lastModified TIMESTAMP,
        agentName STRING,
        changeCount INT64,
        PRIMARY KEY (path)
      )`,
      `CREATE NODE TABLE IF NOT EXISTS Symbol (
        name STRING,
        type STRING,
        filePath STRING,
        line INT64,
        agentName STRING,
        PRIMARY KEY (name)
      )`,
      `CREATE NODE TABLE IF NOT EXISTS Session (
        id STRING,
        agentName STRING,
        task STRING,
        startedAt TIMESTAMP,
        endedAt TIMESTAMP,
        PRIMARY KEY (id)
      )`,
    ]

    for (const schema of schemas) {
      try {
        await this.graphService.query(schema)
      } catch (e) {
        console.warn('[MemoryService] Schema warning:', e)
      }
    }

    const relSchemas = [
      `CREATE REL TABLE IF NOT EXISTS RELATES_TO (FROM File TO Memory, type STRING, MANY_MANY)`,
      `CREATE REL TABLE IF NOT EXISTS DEFINED_IN (FROM Symbol TO File, MANY_MANY)`,
      `CREATE REL TABLE IF NOT EXISTS EXTRACTED_FROM (FROM Memory TO Session, MANY_MANY)`,
      `CREATE REL TABLE IF NOT EXISTS MODIFIED_IN (FROM File TO Session, changeType STRING, MANY_MANY)`,
    ]

    for (const schema of relSchemas) {
      try {
        await this.graphService.query(schema)
      } catch (e) {
        console.warn('[MemoryService] Rel schema warning:', e)
      }
    }
  }

  /**
   * Get all memories from the Working Graph
   */
  async getAll(options: { limit?: number } = {}): Promise<Memory[]> {
    if (!this.graphReady || !this.graphService) return []

    const limit = options.limit || 100
    const result = await this.graphService.query(`
      MATCH (m:Memory)
      RETURN m
      ORDER BY m.updatedAt DESC
      LIMIT ${limit}
    `)

    return result.map((r: { m: any }) => this.parseMemoryNode(r.m))
  }

  /**
   * Delete a memory by key
   */
  async forget(key: string): Promise<boolean> {
    if (!this.graphReady || !this.graphService) return false

    const escaped = (s: string) => s.replace(/'/g, "''")

    await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.key = '${escaped(key)}'
      DETACH DELETE m
    `)
    return true
  }

  /**
   * Store a memory extracted from sessions or explicitly added
   */
  async remember(memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'useCount'>): Promise<Memory> {
    const fullMemory: Memory = {
      ...memory,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      useCount: 0,
    }

    if (this.graphReady) {
      await this.storeInGraph(fullMemory)
    }

    await this.hub?.publish(
      LoomMsgHub.msg(Channel.MEMORY_STORED, {
        memoryId: fullMemory.id,
        key: fullMemory.key,
      })
    )

    return fullMemory
  }

  private async storeInGraph(memory: Memory): Promise<void> {
    if (!this.graphService) return

    const escaped = (s: string) => s.replace(/'/g, "''")

    await this.graphService.query(`
      CREATE (m:Memory {
        id: '${memory.id}',
        key: '${escaped(memory.key)}',
        content: '${escaped(memory.content)}',
        source: '${memory.source}',
        createdAt: timestamp('${memory.createdAt.toISOString()}'),
        updatedAt: timestamp('${memory.updatedAt.toISOString()}'),
        useCount: ${memory.useCount},
        sessionId: '${memory.sessionId || ''}',
        agentName: '${memory.agentName || ''}'
      })
    `)

    // Create relationships to files mentioned in content
    const fileRefs = this.extractFileReferences(memory.content)
    for (const filePath of fileRefs) {
      try {
        await this.upsertFile(filePath, memory.agentName)
        await this.graphService.query(`
          MATCH (m:Memory {id: '${memory.id}'}), (f:File {path: '${escaped(filePath)}'})
          CREATE (f)-[:RELATES_TO {type: 'memory_source'}]->(m)
        `)
      } catch {}
    }
  }

  /**
   * Upsert a file node when it's been modified
   */
  async upsertFile(path: string, agentName?: string): Promise<void> {
    if (!this.graphService) return

    const escaped = (s: string) => s.replace(/'/g, "''")

    // Try to update existing
    const existing = await this.graphService.query(`
      MATCH (f:File {path: '${escaped(path)}'})
      RETURN f
    `)

    if (existing.length > 0) {
      await this.graphService.query(`
        MATCH (f:File {path: '${escaped(path)}'})
        SET f.lastModified = timestamp('${new Date().toISOString()}'),
            f.changeCount = f.changeCount + 1
      `)
    } else {
      await this.graphService.query(`
        CREATE (f:File {
          path: '${escaped(path)}',
          lastModified: timestamp('${new Date().toISOString()}'),
          agentName: '${agentName || ''}',
          changeCount: 1
        })
      `)
    }
  }

  /**
   * Record a session in the graph
   */
  async recordSession(sessionId: string, agentName: string, task: string): Promise<void> {
    if (!this.graphService) return

    const escaped = (s: string) => s.replace(/'/g, "''")

    await this.graphService.query(`
      CREATE (s:Session {
        id: '${escaped(sessionId)}',
        agentName: '${escaped(agentName)}',
        task: '${escaped(task)}',
        startedAt: timestamp('${new Date().toISOString()}')
      })
    `)
  }

  /**
   * Promote session events to the Working Graph (Tier 1 -> Tier 2)
   * Called at session end to extract meaningful nodes.
   */
  async promoteSession(sessionId: string, agentName: string): Promise<void> {
    if (!this.graphService || !this.sessionStore) return

    const events = this.sessionStore.getSessionJournal(sessionId)
    if (events.length === 0) return

    console.log(`[MemoryService] Promoting ${events.length} events from session ${sessionId}`)

    // Record the session itself
    const firstEventPayload = events[0]?.payload as { task?: string } | undefined
    await this.recordSession(sessionId, agentName, firstEventPayload?.task || 'unknown')

    // Extract meaningful entities from events
    for (const event of events) {
      await this.processEventForGraph(sessionId, event)
    }

    // Update session end time
    const escaped = (s: string) => s.replace(/'/g, "''")
    await this.graphService.query(`
      MATCH (s:Session {id: '${escaped(sessionId)}'})
      SET s.endedAt = timestamp('${new Date().toISOString()}')
    `)

    console.log(`[MemoryService] Promoted session ${sessionId} to Working Graph`)
  }

  private async processEventForGraph(sessionId: string, event: { kind: string; payload: any }): Promise<void> {
    if (!this.graphService) return

    const escaped = (s: string) => s.replace(/'/g, "''")

    switch (event.kind) {
      case 'file_write':
      case 'file_edit': {
        const filePath = event.payload?.filePath || event.payload?.path
        if (filePath) {
          await this.upsertFile(filePath, event.payload?.agentName)
          await this.graphService.query(`
            MATCH (f:File {path: '${escaped(filePath)}'}), (s:Session {id: '${escaped(sessionId)}'})
            CREATE (f)-[:MODIFIED_IN {changeType: '${event.kind}'}]->(s)
          `)
        }
        break
      }

      case 'tool_call': {
        // Extract memory from tool results
        if (event.payload?.toolName === 'FileReadTool' && event.payload?.result) {
          const content = typeof event.payload.result === 'string'
            ? event.payload.result.slice(0, 500)
            : JSON.stringify(event.payload.result).slice(0, 500)

          await this.remember({
            key: `file-read-${Date.now()}`,
            content,
            source: 'extracted',
            sessionId,
            agentName: event.payload?.agentName,
          })
        }
        break
      }

      case 'memory_approved': {
        // User-approved memory gets stored explicitly
        await this.remember({
          key: event.payload?.key || `memory-${Date.now()}`,
          content: event.payload?.content || '',
          source: 'explicit',
          sessionId,
          agentName: event.payload?.agentName,
        })
        break
      }
    }
  }

  /**
   * Search for relevant memories
   */
  async searchRelevant(query: string, limit: number = 5): Promise<MemorySearchResult[]> {
    if (!this.graphReady || !this.graphService) return []

    const escaped = (s: string) => s.replace(/'/g, "''")
    const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 3)

    if (keywords.length === 0) return []

    const pattern = keywords.join('|')

    const result = await this.graphService.query(`
      MATCH (m:Memory)
      WHERE m.content =~ '(?i).*(${escaped(pattern)}).*' OR m.key =~ '(?i).*(${escaped(pattern)}).*'
      RETURN m
      ORDER BY m.useCount DESC
      LIMIT ${limit}
    `)

    return result.map((r: { m: any }, index: number) => ({
      memory: this.parseMemoryNode(r.m),
      relevance: 1.0 - (index * 0.1),
    }))
  }

  /**
   * Get memories by file
   */
  async getMemoriesForFile(filePath: string): Promise<Memory[]> {
    if (!this.graphReady || !this.graphService) return []

    const escaped = (s: string) => s.replace(/'/g, "''")

    const result = await this.graphService.query(`
      MATCH (f:File {path: '${escaped(filePath)}'})-[:RELATES_TO]->(m:Memory)
      RETURN m
      ORDER BY m.updatedAt DESC
    `)

    return result.map((r: { m: any }) => this.parseMemoryNode(r.m))
  }

  /**
   * Get files touched by an agent
   */
  async getFilesByAgent(agentName: string): Promise<FileNode[]> {
    if (!this.graphReady || !this.graphService) return []

    const escaped = (s: string) => s.replace(/'/g, "''")

    const result = await this.graphService.query(`
      MATCH (f:File)
      WHERE f.agentName = '${escaped(agentName)}'
      RETURN f
      ORDER BY f.lastModified DESC
    `)

    return result.map((r: { f: any }) => ({
      path: r.f.path,
      lastModified: new Date(r.f.lastModified),
      agentName: r.f.agentName,
      changeCount: r.f.changeCount,
    }))
  }

  /**
   * Format memories for agent context
   */
  async formatForContext(taskDescription: string, _budget: number): Promise<string> {
    const parts: string[] = []

    // Tier 1: Current session
    if (this.sessionStore) {
      const activeSession = this.sessionStore.getActiveSession()
      if (activeSession) {
        const t1 = this.sessionStore.formatContextForLLM(activeSession.sessionId)
        if (t1) parts.push(t1)
      }
    }

    // Tier 2: Relevant from Working Graph
    if (this.graphReady) {
      const relevant = await this.searchRelevant(taskDescription, 4)
      if (relevant.length > 0) {
        const lines = relevant.map(({ memory }) => {
          const age = this.formatAge(memory.createdAt)
          return `- ${memory.key}: ${memory.content.slice(0, 100)}${memory.content.length > 100 ? '...' : ''} (${age})`
        })
        parts.push(`[WORKING GRAPH]\n${lines.join('\n')}`)
      }
    }

    return parts.join('\n\n')
  }

  private parseMemoryNode(node: any): Memory {
    return {
      id: node.id,
      key: node.key,
      content: node.content,
      source: node.source,
      createdAt: new Date(node.createdAt),
      updatedAt: new Date(node.updatedAt),
      useCount: node.useCount,
      sessionId: node.sessionId || undefined,
      agentName: node.agentName || undefined,
    }
  }

  private extractFileReferences(content: string): string[] {
    const matches = content.match(/(?:\/?[\w.-]+\/)+[\w.-]+\.[\w]+/g) || []
    return [...new Set(matches)]
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
