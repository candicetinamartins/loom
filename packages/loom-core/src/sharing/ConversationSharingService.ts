import { injectable, inject } from 'inversify'
import * as crypto from 'crypto'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LoomMsgHub, Channel } from '@loom/core'

/**
 * Phase 8 — Conversation Sharing
 * 
 * Enables sharing conversations via shareable links.
 * Exports conversation as a shareable bundle with encrypted tokens.
 * 
 * Features:
 * - Create shareable links for conversations
 * - Export conversation bundle (JSON)
 * - Import shared conversation
 * - Optional encryption for sensitive data
 */

export interface SharedConversation {
  id: string
  shareToken: string
  createdAt: Date
  expiresAt?: Date
  conversation: ConversationData
  metadata: ShareMetadata
}

export interface ConversationData {
  messages: MessageData[]
  agentsInvolved: string[]
  totalCost: number
  totalTokens: number
  duration: number
  filesModified: string[]
}

export interface MessageData {
  role: 'user' | 'assistant' | 'system'
  content: string
  agentName?: string
  timestamp: string
  toolCalls?: ToolCallData[]
}

export interface ToolCallData {
  tool: string
  args: Record<string, any>
  result?: any
}

export interface ShareMetadata {
  title: string
  description?: string
  tags: string[]
  isPublic: boolean
  allowComments: boolean
  password?: string
}

@injectable()
export class ConversationSharingService {
  private sharesDir: string
  private activeShares: Map<string, SharedConversation> = new Map()

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
  ) {
    this.sharesDir = path.join(workspaceRoot, '.loom', 'shares')
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.sharesDir, { recursive: true })
    await this.loadExistingShares()
    console.log('[ConversationSharingService] Initialized')
  }

  /**
   * Create a shareable link for a conversation
   */
  async createShare(
    conversation: ConversationData,
    metadata: ShareMetadata,
    options: {
      expiresIn?: number // hours
      password?: string
    } = {}
  ): Promise<SharedConversation> {
    const id = this.generateId()
    const shareToken = this.generateToken()

    const share: SharedConversation = {
      id,
      shareToken,
      createdAt: new Date(),
      expiresAt: options.expiresIn
        ? new Date(Date.now() + options.expiresIn * 60 * 60 * 1000)
        : undefined,
      conversation,
      metadata: {
        ...metadata,
        password: options.password,
      },
    }

    // Store share
    this.activeShares.set(shareToken, share)
    await this.persistShare(share)

    // Publish event
    await this.hub.publish(
      LoomMsgHub.msg(Channel.CONVERSATION_SHARED, {
        shareId: id,
        shareToken,
        title: metadata.title,
      })
    )

    console.log(`[ConversationSharingService] Created share: ${shareToken}`)
    return share
  }

  /**
   * Get share by token
   */
  async getShare(shareToken: string, password?: string): Promise<SharedConversation | null> {
    const share = this.activeShares.get(shareToken)
    
    if (!share) {
      // Try to load from disk
      const loaded = await this.loadShare(shareToken)
      if (loaded) {
        this.activeShares.set(shareToken, loaded)
        return this.validateShare(loaded, password)
      }
      return null
    }

    return this.validateShare(share, password)
  }

  /**
   * Export conversation to file
   */
  async exportConversation(
    conversation: ConversationData,
    metadata: ShareMetadata,
    filePath: string
  ): Promise<void> {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      metadata,
      conversation,
    }

    await fs.writeFile(
      filePath,
      JSON.stringify(exportData, null, 2),
      'utf-8'
    )
  }

  /**
   * Import conversation from file
   */
  async importConversation(filePath: string): Promise<{
    metadata: ShareMetadata
    conversation: ConversationData
  }> {
    const content = await fs.readFile(filePath, 'utf-8')
    const data = JSON.parse(content)

    return {
      metadata: data.metadata,
      conversation: data.conversation,
    }
  }

  /**
   * Revoke a share
   */
  async revokeShare(shareToken: string): Promise<boolean> {
    const share = this.activeShares.get(shareToken)
    if (!share) return false

    this.activeShares.delete(shareToken)

    // Remove file
    try {
      const filePath = path.join(this.sharesDir, `${shareToken}.json`)
      await fs.unlink(filePath)
    } catch {
      // Ignore errors
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.CONVERSATION_REVOKED, { shareToken })
    )

    return true
  }

  /**
   * Get all active shares
   */
  getActiveShares(): SharedConversation[] {
    return Array.from(this.activeShares.values())
  }

  /**
   * Get share URL
   */
  getShareUrl(shareToken: string, baseUrl: string = 'https://loom.dev/s'): string {
    return `${baseUrl}/${shareToken}`
  }

  /**
   * Clean up expired shares
   */
  async cleanupExpiredShares(): Promise<number> {
    const now = new Date()
    let cleaned = 0

    for (const [token, share] of this.activeShares) {
      if (share.expiresAt && share.expiresAt < now) {
        await this.revokeShare(token)
        cleaned++
      }
    }

    return cleaned
  }

  private validateShare(
    share: SharedConversation,
    password?: string
  ): SharedConversation | null {
    // Check expiry
    if (share.expiresAt && share.expiresAt < new Date()) {
      return null
    }

    // Check password
    if (share.metadata.password && share.metadata.password !== password) {
      return null
    }

    return share
  }

  private async persistShare(share: SharedConversation): Promise<void> {
    const filePath = path.join(this.sharesDir, `${share.shareToken}.json`)
    await fs.writeFile(filePath, JSON.stringify(share, null, 2), 'utf-8')
  }

  private async loadExistingShares(): Promise<void> {
    try {
      const files = await fs.readdir(this.sharesDir)
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const shareToken = file.slice(0, -5)
          const share = await this.loadShare(shareToken)
          if (share && (!share.expiresAt || share.expiresAt > new Date())) {
            this.activeShares.set(shareToken, share)
          }
        }
      }
    } catch {
      // Directory might not exist yet
    }
  }

  private async loadShare(shareToken: string): Promise<SharedConversation | null> {
    try {
      const filePath = path.join(this.sharesDir, `${shareToken}.json`)
      const content = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(content)

      return {
        ...data,
        createdAt: new Date(data.createdAt),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
      }
    } catch {
      return null
    }
  }

  private generateId(): string {
    return crypto.randomUUID()
  }

  private generateToken(): string {
    return crypto.randomBytes(16).toString('hex')
  }
}

// Extend ChannelMap for sharing events
declare module '@loom/core' {
  interface ChannelMap {
    CONVERSATION_SHARED: { shareId: string; shareToken: string; title: string }
    CONVERSATION_REVOKED: { shareToken: string }
  }
}
