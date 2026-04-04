import { EventEmitter } from 'events'

export const Channel = {
  // Agent lifecycle
  AGENT_STARTED: 'agent:started',
  AGENT_PROGRESS: 'agent:progress',
  AGENT_COMPLETE: 'agent:complete',
  AGENT_FAILED: 'agent:failed',
  AGENT_USAGE_RECORDED: 'agent:usage_recorded',

  // Results
  RESULT_PARTIAL: 'result:partial',
  RESULT_FINAL: 'result:final',
  RESULT_VERIFIED: 'result:verified',
  RESULT_QUARANTINED: 'result:quarantined',

  // Orchestration
  WAVE_COMPLETE: 'wave:complete',
  WAVE_STARTED: 'wave:started',
  WAVE_SKIPPED: 'wave:skipped',
  PLAN_COMPLETE: 'plan:complete',
  COMMAND_STARTED: 'command:started',
  COMMAND_COMPLETE: 'command:complete',

  // System
  MEMORY_EXTRACTED: 'memory:extracted',
  MEMORY_STORED: 'memory:stored',
  MEMORY_DELETED: 'memory:deleted',
  GRAPH_UPDATED: 'graph:updated',
  HOOK_TRIGGERED: 'hook:triggered',
  HOOK_WARNING: 'hook:warning',
  HOOK_NOTIFICATION: 'hook:notification',
  HOOK_CONTEXT_UPDATE: 'hook:context_update',
  BUDGET_ALERT: 'budget:alert',

  // Debug
  DEBUG_BREAKPOINT_SET: 'debug:breakpoint_set',
  DEBUG_SESSION_REQUEST: 'debug:session_request',
  DEBUG_SESSION_STARTED: 'debug:session_started',
  DEBUG_STEPPED: 'debug:stepped',
  DEBUG_EVALUATED: 'debug:evaluated',

  // PR Review
  PR_REVIEW_STARTED: 'pr_review:started',
  PR_REVIEW_COMPLETED: 'pr_review:completed',

  // Sharing
  CONVERSATION_SHARED: 'conversation:shared',
  CONVERSATION_REVOKED: 'conversation:revoked',

  // Checkpoints
  CHECKPOINT_CREATED: 'checkpoint:created',
  CHECKPOINT_RESTORED: 'checkpoint:restored',
} as const

export type ChannelName = typeof Channel[keyof typeof Channel]

export interface LoomMsg<T = unknown> {
  channel: ChannelName
  timestamp: number
  data?: T
  // Common metadata fields used across the system
  sessionId?: string
  breakpointId?: string
  command?: string
  waveIndex?: number
  agent?: string
  agentName?: string
  memoryId?: string
  key?: string
  task?: string
  prNumber?: number
  shareId?: string
  shareToken?: string
  dailyUsed?: number
  program?: string
  action?: string
  expression?: string
  status?: string
  summary?: string
  files_created?: string[]
  files_modified?: string[]
  key_findings?: string[]
  next_actions?: string[]
  // Additional common fields used in debug and orchestration
  args?: string[]
  runtime?: string
  line?: number
  file?: string
  result?: T
  type?: string
  // Additional fields from build errors
  payload?: T
  tier?: string
  cost?: number
  dailyLimit?: number
  repository?: string
  title?: string
  agents?: string[]
  agentCount?: number
  wavesCompleted?: number
  subtask?: string
  results?: T[]
  reason?: string
  cwd?: string
  tokenUsage?: number
  stepCount?: number
  confidence?: number
  description?: string
  activeFile?: string
  terminalActive?: boolean
  recentDiagnostics?: string[]
  content?: string
  mode?: string
  completedCount?: number
  monthlyUsed?: number
  monthlyLimit?: number
  totalCost?: number
  // Hook-related fields
  hook?: string
  step?: string
  error?: string
}

export type Handler<T> = (msg: LoomMsg<T>) => void | Promise<void>

export class LoomMsgHub extends EventEmitter {
  private history: Map<ChannelName, LoomMsg[]> = new Map()

  // Override EventEmitter.on to return unsubscribe function
  override on<T>(channel: ChannelName, handler: Handler<T>): this {
    super.on(channel, handler)
    return this
  }

  // Custom subscribe that returns unsubscribe
  subscribe<T>(channel: ChannelName, handler: Handler<T>): () => void {
    super.on(channel, handler)
    return () => this.off(channel, handler)
  }

  // Override EventEmitter.once - always returns this for compatibility
  override once<T>(channel: ChannelName, handler: Handler<T>): this {
    super.once(channel, handler)
    return this
  }

  // Async version that returns Promise - use this for awaiting messages
  onceAsync<T>(channel: ChannelName): Promise<LoomMsg<T>> {
    return new Promise((resolve) => {
      super.once(channel, resolve as any)
    })
  }

  // Custom waitFor that returns Promise
  waitFor<T>(channel: ChannelName): Promise<LoomMsg<T>> {
    return new Promise((resolve) => {
      super.once(channel, resolve)
    })
  }

  async publish<T>(msg: LoomMsg<T>): Promise<void> {
    msg.timestamp = Date.now()
    
    if (!this.history.has(msg.channel)) {
      this.history.set(msg.channel, [])
    }
    this.history.get(msg.channel)!.push(msg)
    
    this.emit(msg.channel, msg)
  }

  static msg<T>(channel: ChannelName, fields: Omit<LoomMsg<T>, 'channel' | 'timestamp'>): LoomMsg<T> {
    return {
      channel,
      timestamp: Date.now(),
      ...fields,
    }
  }

  replay(channel: ChannelName): LoomMsg[] {
    return this.history.get(channel) ?? []
  }

  dispose(): void {
    this.history.clear()
    this.removeAllListeners()
  }
}
