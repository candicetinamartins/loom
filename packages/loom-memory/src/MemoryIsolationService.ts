import { injectable, inject, optional } from 'inversify'
import { MemoryService, type Memory } from './MemoryService'
import { SessionStore } from './tier1/SessionStore'
import { MEMORY_TYPES } from './loom-memory-module'

/**
 * MemoryIsolationService — session boundary management for long-term memory.
 *
 * Session tracking is delegated to SessionStore (Tier 1 SQLite journal).
 * This service handles the promotion lifecycle:
 *   session end (approved) → walk Tier 2 memories for this session → promote to Tier 3
 *
 * Replaces the old in-memory Map<string, SessionMemory> approach that was
 * tightly coupled to OpenCode's session model. See TIER1_REPLACEMENT.md.
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
  // In-memory approval flags — approval is a UI gesture while the app is running;
  // no need to persist across restarts.
  private approvedSessions: Set<string> = new Set()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    @inject(MEMORY_TYPES.MemoryService) @optional() private memoryService: MemoryService,
    @inject(MEMORY_TYPES.SessionStore) @optional() private sessionStore: SessionStore,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  startCleanupSchedule(): void {
    if (this.cleanupInterval) return
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions()
    }, 60 * 60 * 1000)
    console.log('[MemoryIsolationService] Cleanup schedule started (hourly)')
  }

  stopCleanupSchedule(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  // ── Session management ─────────────────────────────────────────────────────

  createSession(agentName: string, task: string): string {
    if (!this.sessionStore) return `fallback-${Date.now()}`
    return this.sessionStore.startSession(agentName, task)
  }

  /** Store memory within a session scope (Tier 2, not yet promoted to Tier 3) */
  async storeSessionMemory(
    sessionId: string,
    content: string,
    options: { key?: string; agentName?: string } = {}
  ): Promise<Memory | null> {
    if (!this.memoryService) return null
    return this.memoryService.remember(content, {
      key: options.key,
      tier: 2,
      source: 'extracted',
      sessionId,
      agentName: options.agentName,
    })
  }

  /** Approve a session — promote all its Tier 2 memories to Tier 3 */
  async approveSession(sessionId: string): Promise<void> {
    this.approvedSessions.add(sessionId)
    if (!this.memoryService || !this.sessionStore) return

    const all = await this.memoryService.getAll({ tier: 2, limit: 500 })
    const sessionMems = all.filter(m => m.sessionId === sessionId)

    for (const memory of sessionMems) {
      await this.memoryService.remember(memory.content, {
        key: memory.key,
        tier: 3,
        source: memory.source,
        sessionId,
        agentName: memory.agentName,
      })
    }

    this.sessionStore.endSession(sessionId, true)
    console.log(`[MemoryIsolationService] Session ${sessionId} approved — ${sessionMems.length} memories promoted`)
  }

  /** Discard a session without promoting its memories */
  discardSession(sessionId: string): void {
    this.approvedSessions.delete(sessionId)
    this.sessionStore?.endSession(sessionId, false)
  }

  getSessionMemories(sessionId: string): Memory[] {
    // Synchronous in-session memories are not tracked here anymore;
    // use MemoryService.getAll({ sessionId }) for async Tier 2 query
    return []
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  async cleanupExpiredSessions(): Promise<void> {
    // The SessionStore SQLite startup cleanup handles sessions older than 48h.
    // This hook is available for future custom TTL logic.
  }

  // ── Memory extraction ──────────────────────────────────────────────────────

  /**
   * Extract memories from an agent transcript using pattern matching.
   * Full LLM extraction (Haiku) planned for Phase E.
   */
  async extractMemoriesFromSession(
    sessionId: string,
    transcript: string,
    agentName: string
  ): Promise<Memory[]> {
    const extracted: Memory[] = []
    const decisionPatterns = [
      /decided to ([\w\s]+)/gi,
      /chose to ([\w\s]+)/gi,
      /using ([\w\s]+) for ([\w\s]+)/gi,
      /opted for ([\w\s]+)/gi,
    ]
    for (const pattern of decisionPatterns) {
      for (const match of transcript.matchAll(pattern)) {
        const content = match[0].trim()
        if (content.length >= 10 && content.length <= 200) {
          const m = await this.storeSessionMemory(sessionId, content, { agentName })
          if (m) extracted.push(m)
        }
      }
    }
    return extracted
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getActiveSessions(): SessionMemory[] {
    if (!this.sessionStore) return []
    const active = this.sessionStore.getActiveSession()
    if (!active) return []
    return [{
      sessionId: active.sessionId,
      memories: [],
      createdAt: new Date(active.startedAt),
      expiresAt: new Date(active.startedAt + 24 * 60 * 60 * 1000),
      approved: this.approvedSessions.has(active.sessionId),
    }]
  }

  isApproved(sessionId: string): boolean {
    return this.approvedSessions.has(sessionId)
  }
}
