import { injectable, inject } from 'inversify'
import { MEMORY_TYPES } from '../loom-memory-module'
import type { SessionStore, RawSessionEvent, SessionEventKind } from '../tier1/SessionStore'

/**
 * MemPalaceService — TypeScript client for the Python MemPalace bridge.
 * 
 * This service provides Tier 2 memory: semantic vector storage using
 * MemPalace's ChromaDB backend. It's called by MemoryIsolationService
 * to promote Tier 1 session events into searchable long-term memory.
 * 
 * Architecture:
 *   - Python service runs on localhost:8765 (started by loom-electron)
 *   - HTTP API for mine (index), search (query), status (health)
 *   - Data stored at ~/.mempalace/loom/ (ChromaDB vectors)
 * 
 * Palace structure in Loom:
 *   Wing: agent name (e.g., "codesmith", "architect")
 *   Room: session id (e.g., "session_abc123")
 *   Closet: "events" (all session events)
 *   Drawer: individual event (file_write, tool_call, etc.)
 */

export interface MemPalaceStatus {
  status: string
  mempalace_available: boolean
  data_path: string
  wings_count: number
  rooms_count: number
  drawers_count: number
}

export interface MemPalaceSearchResult {
  id: string
  content: string
  wing: string
  room: string
  closet?: string
  score: number
  metadata: Record<string, unknown>
  timestamp: string
}

export interface MemPalaceQueryResponse {
  query: string
  memories_found: number
  context: string
  results: MemPalaceSearchResult[]
}

export interface MineRequest {
  session_id: string
  agent_name: string
  task: string
  events: RawSessionEvent[]  // Using actual type from SessionStore
  timestamp?: string
}

export interface MineResponse {
  success: boolean
  session_id: string
  drawers_added: number
  wing: string
  room: string
}

@injectable()
export class MemPalaceService {
  private readonly baseUrl: string
  private isAvailable = false
  private lastStatusCheck = 0

  constructor(
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore?: SessionStore,
  ) {
    // Python service runs on localhost:8765 by default
    this.baseUrl = 'http://127.0.0.1:8765'
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Check if MemPalace Python service is running.
   * Called by MemoryService.initialize() at startup.
   */
  async checkAvailability(): Promise<boolean> {
    // Cache status for 30 seconds to avoid spamming
    if (Date.now() - this.lastStatusCheck < 30000) {
      return this.isAvailable
    }

    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })

      if (response.ok) {
        const status = await response.json() as MemPalaceStatus
        this.isAvailable = status.mempalace_available
        this.lastStatusCheck = Date.now()
        
        if (this.isAvailable) {
          console.log(`[MemPalaceService] Connected: ${status.wings_count} wings, ${status.drawers_count} drawers`)
        } else {
          console.warn('[MemPalaceService] Python bridge reports mempalace not installed')
        }
      } else {
        this.isAvailable = false
        console.warn('[MemPalaceService] Python bridge not responding')
      }
    } catch (e) {
      this.isAvailable = false
      console.warn('[MemPalaceService] Python bridge unreachable:', e instanceof Error ? e.message : String(e))
    }

    return this.isAvailable
  }

  // ── Tier 2: Promotion from Tier 1 ────────────────────────────────────────────

  /**
   * Mine a session's events into MemPalace (Tier 1 → Tier 2 promotion).
   * Called by MemoryIsolationService at session end.
   * 
   * @param sessionId The session to promote
   * @param agentName The agent that ran the session
   * @param task The task description
   * @returns Number of memories indexed
   */
  async mineSession(sessionId: string, agentName: string, task: string): Promise<number> {
    if (!this.isAvailable) {
      console.warn('[MemPalaceService] Not available, skipping session mining')
      return 0
    }

    if (!this.sessionStore) {
      console.warn('[MemPalaceService] SessionStore not injected, cannot fetch events')
      return 0
    }

    // Get all events for this session from Tier 1
    const events = this.sessionStore.getSessionJournal(sessionId)
    if (events.length === 0) {
      console.log(`[MemPalaceService] No events for session ${sessionId}, skipping`)
      return 0
    }

    try {
      const response = await fetch(`${this.baseUrl}/mine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          agent_name: agentName,
          task,
          events,
          timestamp: new Date().toISOString(),
        } as MineRequest),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error('[MemPalaceService] Mine failed:', error)
        return 0
      }

      const result = await response.json() as MineResponse
      console.log(`[MemPalaceService] Mined ${result.drawers_added} memories for ${agentName} session`)
      return result.drawers_added
    } catch (e) {
      console.error('[MemPalaceService] Mine error:', e instanceof Error ? e.message : String(e))
      return 0
    }
  }

  // ── Tier 2: Retrieval ───────────────────────────────────────────────────────

  /**
   * Search for semantically relevant memories.
   * Called by MemoryService.formatForContext() to inject into LLM prompts.
   * 
   * @param query Natural language search query
   * @param options Search filters and limits
   * @returns Relevant memories with similarity scores
   */
  async search(
    query: string,
    options: {
      wing?: string      // Filter by agent
      room?: string       // Filter by session
      limit?: number      // Max results (default 5)
      threshold?: number  // Min similarity score (default 0.7)
    } = {}
  ): Promise<MemPalaceSearchResult[]> {
    if (!this.isAvailable) {
      return []
    }

    try {
      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          wing: options.wing,
          room: options.room,
          limit: options.limit ?? 5,
          threshold: options.threshold ?? 0.7,
        }),
      })

      if (!response.ok) {
        return []
      }

      return await response.json() as MemPalaceSearchResult[]
    } catch (e) {
      console.error('[MemPalaceService] Search error:', e instanceof Error ? e.message : String(e))
      return []
    }
  }

  /**
   * Query with context formatting for LLM injection.
   * Returns formatted context string ready to prepend to prompts.
   * 
   * @param query The task/context to find relevant memories for
   * @returns Formatted context string or empty if no memories
   */
  async queryForContext(query: string): Promise<string> {
    if (!this.isAvailable) {
      return ''
    }

    try {
      const response = await fetch(`${this.baseUrl}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: 4,  // Balanced: enough context but not too many tokens
          threshold: 0.75,
        }),
      })

      if (!response.ok) {
        return ''
      }

      const result = await response.json() as MemPalaceQueryResponse
      
      if (result.memories_found === 0) {
        return ''
      }

      // Format as [MEMORY] block for LLM context
      return `[MEMORY: ${result.memories_found} relevant past sessions]\n${result.context}`
    } catch (e) {
      console.error('[MemPalaceService] Query error:', e instanceof Error ? e.message : String(e))
      return ''
    }
  }

  // ── Status ──────────────────────────────────────────────────────────────────

  async getStatus(): Promise<MemPalaceStatus | null> {
    try {
      const response = await fetch(`${this.baseUrl}/status`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      })

      if (response.ok) {
        return await response.json() as MemPalaceStatus
      }
      return null
    } catch {
      return null
    }
  }
}

// Helper for optional injection
declare function optional(): ParameterDecorator
