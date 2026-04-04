import { injectable, inject } from 'inversify'
import * as sqlite3 from 'better-sqlite3'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  agentName?: string
  toolCalls?: string[]
}

export interface Conversation {
  id: string
  title: string
  messages: ConversationMessage[]
  createdAt: number
  updatedAt: number
}

@injectable()
export class ConversationHistoryService {
  private db: sqlite3.Database | null = null
  private currentConversationId: string | null = null

  constructor(
    @inject('LOOM_DB_PATH') private dbPath: string = '~/.config/loom/history.sqlite'
  ) {
    this.initDatabase()
  }

  private initDatabase(): void {
    try {
      this.db = sqlite3(this.dbPath)
      this.createTables()
    } catch (error) {
      console.error('Failed to initialize SQLite database:', error)
      this.db = sqlite3(':memory:')
      this.createTables()
    }
  }

  private createTables(): void {
    if (!this.db) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversationId TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        agentName TEXT,
        toolCalls TEXT,
        FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_conversationId ON messages(conversationId);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `)

    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          conversationId UNINDEXED,
          tokenize='porter'
        )
      `)

      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_fts_insert 
        AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(content, conversationId) 
          VALUES (new.content, new.conversationId);
        END;

        CREATE TRIGGER IF NOT EXISTS messages_fts_delete
        AFTER DELETE ON messages BEGIN
          DELETE FROM messages_fts WHERE rowid = old.rowid;
        END;
      `)
    } catch (error) {
      console.warn('FTS5 not available, using basic search:', error)
    }
  }

  createConversation(title: string): Conversation {
    const id = `conv-${Date.now()}`
    const now = Date.now()
    
    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO conversations (id, title, createdAt, updatedAt)
        VALUES (?, ?, ?, ?)
      `)
      stmt.run(id, title, now, now)
    }

    this.currentConversationId = id
    return {
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    }
  }

  getConversation(id: string): Conversation | undefined {
    if (!this.db) return undefined

    const conversation = this.db.prepare(
      'SELECT * FROM conversations WHERE id = ?'
    ).get(id) as any

    if (!conversation) return undefined

    const messages = this.db.prepare(
      'SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp'
    ).all(id) as any[]

    return {
      id: conversation.id,
      title: conversation.title,
      messages: messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        agentName: m.agentName,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      })),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    }
  }

  getCurrentConversation(): Conversation | undefined {
    if (!this.currentConversationId) return undefined
    return this.getConversation(this.currentConversationId)
  }

  setCurrentConversation(id: string): void {
    this.currentConversationId = id
  }

  addMessage(message: Omit<ConversationMessage, 'id' | 'timestamp'>): ConversationMessage {
    if (!this.currentConversationId) {
      throw new Error('No active conversation')
    }

    const fullMessage: ConversationMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    }

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO messages (id, conversationId, role, content, timestamp, agentName, toolCalls)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        fullMessage.id,
        this.currentConversationId,
        fullMessage.role,
        fullMessage.content,
        fullMessage.timestamp,
        fullMessage.agentName || null,
        fullMessage.toolCalls ? JSON.stringify(fullMessage.toolCalls) : null
      )

      this.db.prepare(
        'UPDATE conversations SET updatedAt = ? WHERE id = ?'
      ).run(fullMessage.timestamp, this.currentConversationId)
    }

    return fullMessage
  }

  getRecentMessages(limit: number = 10): ConversationMessage[] {
    if (!this.currentConversationId) return []

    if (this.db) {
      const messages = this.db.prepare(`
        SELECT * FROM messages 
        WHERE conversationId = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      `).all(this.currentConversationId, limit) as any[]

      return messages.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        agentName: m.agentName,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      })).reverse()
    }

    return []
  }

  searchConversations(query: string): Conversation[] {
    if (!this.db) return []

    try {
      const ftsResults = this.db.prepare(`
        SELECT DISTINCT c.* 
        FROM conversations c
        JOIN messages_fts fts ON c.id = fts.conversationId
        WHERE fts MATCH ?
        ORDER BY c.updatedAt DESC
      `).all(query) as any[]

      if (ftsResults.length > 0) {
        return ftsResults.map(r => this.getConversation(r.id)!).filter(Boolean)
      }
    } catch {
      // Fall through to LIKE search
    }

    const results = this.db.prepare(`
      SELECT DISTINCT c.* 
      FROM conversations c
      JOIN messages m ON c.id = m.conversationId
      WHERE m.content LIKE ?
      ORDER BY c.updatedAt DESC
    `).all(`%${query}%`) as any[]

    return results.map(r => this.getConversation(r.id)!).filter(Boolean)
  }

  getAllConversations(): Conversation[] {
    if (!this.db) return []

    const results = this.db.prepare(
      'SELECT * FROM conversations ORDER BY updatedAt DESC'
    ).all() as any[]

    return results.map(r => this.getConversation(r.id)!).filter(Boolean)
  }

  close(): void {
    this.db?.close()
  }
}
