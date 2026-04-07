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

export interface PendingApprovalSession {
  sessionId: string
  agentName: string
  memoriesExtracted: number
  endedAt: number
}

@injectable()
export class MemoryIsolationService {
  // In-memory approval flags — approval is a UI gesture while the app is running;
  // no need to persist across restarts.
  private approvedSessions: Set<string> = new Set()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null
  // Sessions that have been extracted but not yet approved/discarded by the user
  private pendingApproval: Map<string, PendingApprovalSession> = new Map()

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
    this.pendingApproval.delete(sessionId)
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
    this.pendingApproval.delete(sessionId)
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
   * Extract memories from an agent transcript using Claude Haiku.
   *
   * Haiku reads the full transcript and returns a structured list of
   * key decisions, patterns used, and learnings — things worth remembering
   * in future sessions. Falls back to regex pattern matching if the
   * Anthropic SDK or API key is not available.
   *
   * After extraction the session is added to `pendingApproval` so the
   * frontend can prompt the user to promote memories to Tier 3.
   */
  async extractMemoriesFromSession(
    sessionId: string,
    transcript: string,
    agentName: string
  ): Promise<Memory[]> {
    let extracted: Memory[] = []

    // ── Try Haiku extraction ─────────────────────────────────────────────────
    try {
      extracted = await this._extractWithHaiku(sessionId, transcript, agentName)
    } catch (e) {
      console.warn('[MemoryIsolationService] Haiku extraction unavailable, falling back to regex:', e)
    }

    // ── Regex fallback ───────────────────────────────────────────────────────
    if (extracted.length === 0) {
      extracted = await this._extractWithRegex(sessionId, transcript, agentName)
    }

    // ── Mark session as pending user approval ────────────────────────────────
    if (extracted.length > 0) {
      this.pendingApproval.set(sessionId, {
        sessionId,
        agentName,
        memoriesExtracted: extracted.length,
        endedAt: Date.now(),
      })
    }

    return extracted
  }

  /** Sessions that have been extracted but not yet approved or discarded */
  getPendingApprovalSessions(): PendingApprovalSession[] {
    return Array.from(this.pendingApproval.values())
      .sort((a, b) => b.endedAt - a.endedAt)
  }

  // ── Private extraction helpers ─────────────────────────────────────────────

  private async _extractWithHaiku(
    sessionId: string,
    transcript: string,
    agentName: string
  ): Promise<Memory[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set')

    // Dynamic require — avoids bundling the SDK in envs where it isn't installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    const Anthropic = require('@anthropic-ai/sdk')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const client = new Anthropic({ apiKey })

    const systemPrompt = `You are a memory extraction assistant for an AI coding agent named "${agentName}".
Your job is to read a session transcript and extract the most important things to remember for future sessions.

Extract up to 12 items across these categories:
- "decision": architectural or design decisions made ("chose X over Y because Z")
- "pattern": code patterns, idioms, or conventions used ("uses X pattern for Y")
- "learning": bugs fixed, problems solved, or facts discovered ("X causes Y when Z")

Return ONLY a valid JSON array. Each item must have:
  { "content": "<concise 1-2 sentence memory>", "type": "decision" | "pattern" | "learning" }

Rules:
- Be specific and actionable — avoid vague generalities
- Each memory must stand alone without context from this transcript
- Skip trivial observations (file opened, tool ran, etc.)
- Maximum 150 characters per memory`

    const truncated = transcript.length > 12000
      ? transcript.slice(0, 6000) + '\n\n[... middle omitted ...]\n\n' + transcript.slice(-6000)
      : transcript

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const response = await (client as any).messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: `Session transcript:\n\n${truncated}` }],
    })

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const rawText = (response as any).content?.[0]?.text as string ?? ''
    const jsonMatch = rawText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error('Haiku response contained no JSON array')

    const items = JSON.parse(jsonMatch[0]) as Array<{ content: string; type: string }>
    const extracted: Memory[] = []

    for (const item of items) {
      if (typeof item.content !== 'string' || item.content.trim().length < 10) continue
      const source = item.type === 'decision' ? 'decision' : 'extracted'
      const m = await this.storeSessionMemory(sessionId, item.content.trim(), { agentName, key: source })
      if (m) extracted.push(m)
    }

    console.log(`[MemoryIsolationService] Haiku extracted ${extracted.length} memories from ${agentName} session`)
    return extracted
  }

  private async _extractWithRegex(
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
