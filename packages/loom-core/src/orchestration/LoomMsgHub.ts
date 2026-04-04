import { EventEmitter } from 'events'

export const Channel = {
  AGENT_STARTED: 'agent:started',
  AGENT_PROGRESS: 'agent:progress',
  AGENT_COMPLETE: 'agent:complete',
  AGENT_FAILED: 'agent:failed',
  AGENT_USAGE_RECORDED: 'agent:usage_recorded',
  RESULT_PARTIAL: 'result:partial',
  RESULT_FINAL: 'result:final',
  RESULT_VERIFIED: 'result:verified',
  RESULT_QUARANTINED: 'result:quarantined',
  WAVE_STARTED: 'wave:started',
  WAVE_COMPLETE: 'wave:complete',
  WAVE_SKIPPED: 'wave:skipped',
  PLAN_COMPLETE: 'plan:complete',
  COMMAND_STARTED: 'command:started',
  COMMAND_COMPLETE: 'command:complete',
  MEMORY_EXTRACTED: 'memory:extracted',
  MEMORY_STORED: 'memory:stored',
  MEMORY_DELETED: 'memory:deleted',
  GRAPH_UPDATED: 'graph:updated',
  HOOK_TRIGGERED: 'hook:triggered',
  HOOK_WARNING: 'hook:warning',
  HOOK_NOTIFICATION: 'hook:notification',
  HOOK_CONTEXT_UPDATE: 'hook:context_update',
  DEBUG_BREAKPOINT_SET: 'debug:breakpoint_set',
  DEBUG_SESSION_REQUEST: 'debug:session_request',
  DEBUG_SESSION_STARTED: 'debug:session_started',
  DEBUG_STEPPED: 'debug:stepped',
  DEBUG_EVALUATED: 'debug:evaluated',
  PR_REVIEW_STARTED: 'pr_review:started',
  PR_REVIEW_COMPLETED: 'pr_review:completed',
  CONVERSATION_SHARED: 'conversation:shared',
  CONVERSATION_REVOKED: 'conversation:revoked',
  BUDGET_ALERT: 'budget:alert',
} as const

export type ChannelName = typeof Channel[keyof typeof Channel]

export interface LoomMsg<T = unknown> {
  channel: ChannelName
  timestamp: number
  data: T
}

export type Handler<T> = (msg: LoomMsg<T>) => void | Promise<void>

export class LoomMsgHub {
  private emitter = new EventEmitter()
  private history: Map<ChannelName, LoomMsg[]> = new Map()

  on<T>(channel: ChannelName, handler: Handler<T>): () => void {
    this.emitter.on(channel, handler)
    return () => this.emitter.off(channel, handler)
  }

  once<T>(channel: ChannelName): Promise<LoomMsg<T>> {
    return new Promise((resolve) => {
      this.emitter.once(channel, resolve)
    })
  }

  async publish<T>(msg: LoomMsg<T>): Promise<void> {
    msg.timestamp = Date.now()

    if (!this.history.has(msg.channel)) {
      this.history.set(msg.channel, [])
    }
    this.history.get(msg.channel)!.push(msg)

    this.emitter.emit(msg.channel, msg)
  }

  static msg<T>(channel: ChannelName, data: T): LoomMsg<T> {
    return {
      channel,
      timestamp: Date.now(),
      data,
    }
  }

  replay(channel: ChannelName): LoomMsg[] {
    return this.history.get(channel) ?? []
  }

  dispose(): void {
    this.history.clear()
    this.emitter.removeAllListeners()
  }
}
