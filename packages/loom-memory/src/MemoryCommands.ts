import { injectable, inject } from 'inversify'
import { LoomMsgHub, Channel } from '@loom/core'
import { MemoryService } from './MemoryService'
import { MemoryIsolationService } from './MemoryIsolationService'

/**
 * Phase 6 — RememberCommand and ForgetCommand
 * 
 * Implements:
 * - /remember <content> - Store explicit memory
 * - /forget <key> - Delete memory by key
 */

@injectable()
export class RememberCommand {
  readonly command = 'remember'
  readonly description = 'Store a memory for future context'

  constructor(
    @inject(MemoryService) private memoryService: MemoryService,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
  ) {}

  async execute(args: string): Promise<string> {
    if (!args.trim()) {
      return 'Usage: /remember <content>\nExample: /remember Always use TypeScript strict mode'
    }

    const memory = await this.memoryService.remember(args.trim(), {
      source: 'explicit',
      tier: 2,
    })

    await this.hub.publish(
      LoomMsgHub.msg(Channel.MEMORY_STORED, {
        memoryId: memory.id,
        key: memory.key,
        tier: memory.tier,
      })
    )

    return `✅ Memory stored: "${memory.key}" (Tier ${memory.tier})`
  }
}

@injectable()
export class ForgetCommand {
  readonly command = 'forget'
  readonly description = 'Delete a memory by key'

  constructor(
    @inject(MemoryService) private memoryService: MemoryService,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
  ) {}

  async execute(args: string): Promise<string> {
    if (!args.trim()) {
      return 'Usage: /forget <key>\nExample: /forget typescript-strict-mode'
    }

    const key = args.trim()
    const deleted = await this.memoryService.forget(key)

    if (deleted) {
      await this.hub.publish(
        LoomMsgHub.msg(Channel.MEMORY_DELETED, { key })
      )
      return `✅ Memory "${key}" deleted`
    }

    return `❌ Memory "${key}" not found`
  }
}

// Extend LoomMsgHub channels for memory events
declare global {
  interface ChannelMap {
    MEMORY_STORED: { memoryId: string; key: string; tier: string }
    MEMORY_DELETED: { key: string }
  }
}
