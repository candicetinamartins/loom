import { injectable, inject } from 'inversify'
import { MemoryService, Memory } from './MemoryService'

/**
 * Phase 6 — MemoryIsolationService
 * 
 * Manages session boundaries for memory:
 * - Per-session memory isolation
 * - Auto-cleanup expired sessions (24-hour schedule)
 * - Promote session memories to long-term on approval
 */

export interface SessionMemory {
  sessionId: string
  memories: Memory[]
  createdAt: Date
  expiresAt: Date
  approved: boolean
}

@injectable()
export class MemoryIsolationService {
  private activeSessions: Map<string, SessionMemory> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(
    @inject(MemoryService) private memoryService: MemoryService,
  ) {}

  /**
   * Start the 24-hour cleanup schedule
   */
  startCleanupSchedule(): void {
    if (this.cleanupInterval) return

    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions()
    }, 60 * 60 * 1000) // 1 hour

    console.log('[MemoryIsolationService] Cleanup schedule started (24h)')
  }

  /**
   * Stop the cleanup schedule
   */
  stopCleanupSchedule(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Create a new isolated session
   */
  createSession(sessionId: string): SessionMemory {
    const session: SessionMemory = {
      sessionId,
      memories: [],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      approved: false,
    }

    this.activeSessions.set(sessionId, session)
    return session
  }

  /**
   * Store memory in a session (isolated)
   */
  async storeSessionMemory(
    sessionId: string,
    content: string,
    options: {
      key?: string
      agentName?: string
    } = {}
  ): Promise<Memory> {
    let session = this.activeSessions.get(sessionId)
    if (!session) {
      session = this.createSession(sessionId)
    }

    const memory = await this.memoryService.remember(content, {
      key: options.key,
      tier: 2,
      source: 'extracted',
      sessionId,
      agentName: options.agentName,
    })

    session.memories.push(memory)
    return memory
  }

  /**
   * Approve session memories for long-term storage
   * Promotes Tier 2 session memories to Tier 3 (project memory)
   */
  async approveSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    session.approved = true

    // Promote all session memories to Tier 3
    for (const memory of session.memories) {
      await this.memoryService.remember(memory.content, {
        key: memory.key,
        tier: 3,
        source: memory.source,
        sessionId,
      })
    }

    console.log(`[MemoryIsolationService] Session ${sessionId} approved - ${session.memories.length} memories promoted`)
  }

  /**
   * Discard session memories without promoting
   */
  discardSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId)
    if (!session) return

    // Delete all session memories from Tier 2
    for (const memory of session.memories) {
      this.memoryService.forget(memory.key)
    }

    this.activeSessions.delete(sessionId)
    console.log(`[MemoryIsolationService] Session ${sessionId} discarded`)
  }

  /**
   * Get memories for a specific session
   */
  getSessionMemories(sessionId: string): Memory[] {
    const session = this.activeSessions.get(sessionId)
    return session?.memories || []
  }

  /**
   * Cleanup expired sessions
   * Runs on 24-hour schedule
   */
  async cleanupExpiredSessions(): Promise<void> {
    const now = new Date()
    const expired: string[] = []

    for (const [sessionId, session] of this.activeSessions) {
      if (session.expiresAt < now) {
        expired.push(sessionId)
      }
    }

    for (const sessionId of expired) {
      const session = this.activeSessions.get(sessionId)
      if (!session) continue

      if (!session.approved) {
        // Auto-discard unapproved sessions
        this.discardSession(sessionId)
      } else {
        // Keep approved sessions but remove from active
        this.activeSessions.delete(sessionId)
      }
    }

    if (expired.length > 0) {
      console.log(`[MemoryIsolationService] Cleaned up ${expired.length} expired sessions`)
    }
  }

  /**
   * Extract memories from agent session transcript
   * Uses Haiku to identify important memories
   */
  async extractMemoriesFromSession(
    sessionId: string,
    transcript: string,
    agentName: string
  ): Promise<Memory[]> {
    // In production: Call Haiku to extract memories from transcript
    // For now, use simple keyword extraction
    
    const extracted: Memory[] = []
    
    // Look for decision patterns
    const decisionPatterns = [
      /decided to (\w+)/gi,
      /chose to (\w+)/gi,
      /using (\w+) for (\w+)/gi,
      /opted for (\w+)/gi,
    ]
    
    for (const pattern of decisionPatterns) {
      const matches = transcript.matchAll(pattern)
      for (const match of matches) {
        const content = match[0]
        const memory = await this.storeSessionMemory(sessionId, content, { agentName })
        extracted.push(memory)
      }
    }
    
    return extracted
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionMemory[] {
    return Array.from(this.activeSessions.values())
  }
}
