import { EventEmitter } from 'events'

export const Channel = {
  AGENT_STARTED: 'agent:started',
  AGENT_PROGRESS: 'agent:progress',
  AGENT_COMPLETE: 'agent:complete',
  AGENT_FAILED: 'agent:failed',
  RESULT_PARTIAL: 'result:partial',
  RESULT_FINAL: 'result:final',
  RESULT_VERIFIED: 'result:verified',
  RESULT_QUARANTINED: 'result:quarantined',
  WAVE_COMPLETE: 'wave:complete',
  PLAN_COMPLETE: 'plan:complete',
  MEMORY_EXTRACTED: 'memory:extracted',
  GRAPH_UPDATED: 'graph:updated',
  HOOK_TRIGGERED: 'hook:triggered',
} as const

export type ChannelName = typeof Channel[keyof typeof Channel]

export interface LoomMsg<T = unknown> {
  channel: ChannelName
  timestamp: number
  data: T
}

export type Handler<T> = (msg: LoomMsg<T>) => void | Promise<void>

export class LoomMsgHub extends EventEmitter {
  private history: Map<ChannelName, LoomMsg[]> = new Map()

  on<T>(channel: ChannelName, handler: Handler<T>): () => void {
    super.on(channel, handler)
    return () => this.off(channel, handler)
  }

  once<T>(channel: ChannelName): Promise<LoomMsg<T>> {
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
