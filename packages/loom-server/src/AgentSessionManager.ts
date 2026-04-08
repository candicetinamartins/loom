import { injectable, inject } from 'inversify'
import * as crypto from 'crypto'
import { LoomMsgHub, Channel } from '@loom/graph'

export interface SessionConfig {
  agentName: string
  model: string
  thinkingBudget: number
  toolGroups: string[]
  task: string
}

export interface ManagedSession {
  id: string
  config: SessionConfig
  status: 'running' | 'paused' | 'completed' | 'failed'
  startTime: Date
  endTime?: Date
  result?: any
  error?: string
}

/**
 * AgentSessionManager — Manage agent lifecycle and sessions
 * 
 * Features:
 * - Create and track agent sessions
 * - Pause/resume sessions
 * - Aggregate results from multiple sessions
 * - SQLite-backed session persistence
 */
@injectable()
export class AgentSessionManager {
  private sessions: Map<string, ManagedSession> = new Map()

  constructor(
    @inject(LoomMsgHub) private hub: LoomMsgHub,
    @inject('SessionStore') private sessionStore: any
  ) {}

  /**
   * Create a new agent session
   */
  async createSession(config: SessionConfig): Promise<string> {
    const sessionId = this.generateSessionId()
    
    // AgentSession will be created per-execution with proper DI
    // Store config for later session creation
    const sessionDef = {
      name: config.agentName,
      model: config.model,
      thinkingBudget: config.thinkingBudget,
      toolGroups: config.toolGroups,
    }

    const managedSession: ManagedSession = {
      id: sessionId,
      config,
      status: 'running',
      startTime: new Date(),
    }

    this.sessions.set(sessionId, managedSession)

    // Publish session started event
    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_STARTED, {
        sessionId,
        agentName: config.agentName,
        task: config.task,
        timestamp: managedSession.startTime.toISOString(),
      })
    )

    // Store in SQLite
    await this.persistSession(managedSession)

    return sessionId
  }

  /**
   * Execute a session with the given context
   */
  async executeSession(sessionId: string, context: any): Promise<any> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      throw new Error(`Session ${sessionId} not found`)
    }

    try {
      // Note: Actual execution happens via AgentSession.executeLLM()
      // which is called by the orchestration layer
      // This method just tracks the result
      const result = context

      // Update session status
      managed.status = 'completed'
      managed.endTime = new Date()
      managed.result = result

      // Publish completion event
      await this.hub.publish(
        LoomMsgHub.msg(Channel.AGENT_COMPLETE, {
          sessionId,
          agentName: managed.config.agentName,
          result: result.summary || 'Completed',
          duration: managed.endTime.getTime() - managed.startTime.getTime(),
        })
      )

      await this.persistSession(managed)

      return result
    } catch (error) {
      managed.status = 'failed'
      managed.endTime = new Date()
      managed.error = error instanceof Error ? error.message : String(error)

      await this.hub.publish(
        LoomMsgHub.msg(Channel.AGENT_FAILED, {
          sessionId,
          agentName: managed.config.agentName,
          error: managed.error,
        })
      )

      await this.persistSession(managed)
      throw error
    }
  }

  /**
   * Pause a running session
   */
  async pauseSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (managed.status === 'running') {
      managed.status = 'paused'
      // Signal pause to session (implementation depends on AgentSession)
      await this.persistSession(managed)
    }
  }

  /**
   * Resume a paused session
   */
  async resumeSession(sessionId: string): Promise<void> {
    const managed = this.sessions.get(sessionId)
    if (!managed) {
      throw new Error(`Session ${sessionId} not found`)
    }

    if (managed.status === 'paused') {
      managed.status = 'running'
      await this.persistSession(managed)
    }
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ManagedSession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ManagedSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'running' || s.status === 'paused')
  }

  /**
   * Get session history
   */
  getSessionHistory(): ManagedSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'completed' || s.status === 'failed')
      .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))
  }

  /**
   * Clean up old sessions
   */
  async cleanupOldSessions(maxAgeHours: number = 24): Promise<void> {
    const cutoff = Date.now() - (maxAgeHours * 60 * 60 * 1000)
    
    for (const [id, session] of this.sessions) {
      if (session.endTime && session.endTime.getTime() < cutoff) {
        this.sessions.delete(id)
      }
    }
  }

  private generateSessionId(): string {
    return `session-${crypto.randomUUID()}`
  }

  private async persistSession(managed: ManagedSession): Promise<void> {
    if (this.sessionStore) {
      await this.sessionStore.saveSession(managed)
    }
  }
}
