import { ChatMessage, ContextPill, AgentDispatch } from './loom-chat-widget'

/**
 * ChatService - Manages chat state and business logic
 * 
 * Handles:
 * - Message history
 * - Context tracking (current file, agents, tests)
 * - Integration with Loom's agent orchestration
 */
export class ChatService {
  private messages: ChatMessage[] = []
  private currentFile: string = ''
  private activeAgents: AgentDispatch[] = []
  private contextPills: ContextPill[] = []

  // Message management
  addMessage(msg: ChatMessage): void {
    this.messages.push(msg)
    this.pruneHistory()
  }

  getHistory(): ChatMessage[] {
    return [...this.messages]
  }

  clear(): void {
    this.messages = []
  }

  private pruneHistory(): void {
    // Keep last 100 messages
    if (this.messages.length > 100) {
      this.messages = this.messages.slice(-100)
    }
  }

  // Context management
  setCurrentFile(filePath: string): void {
    this.currentFile = filePath
    this.updateContextPills()
  }

  getCurrentFile(): string {
    return this.currentFile
  }

  setActiveAgents(agents: AgentDispatch[]): void {
    this.activeAgents = agents
    this.updateContextPills()
  }

  getActiveAgents(): AgentDispatch[] {
    return [...this.activeAgents]
  }

  getActiveAgentCount(): number {
    return this.activeAgents.filter(a => a.status === 'running' || a.status === 'waiting').length
  }

  updateAgentStatus(agentId: string, status: AgentDispatch['status'], progress: { current: number; total: number }): void {
    const agent = this.activeAgents.find(a => a.id === agentId)
    if (agent) {
      agent.status = status
      agent.progress = progress
    }
  }

  // Context pills for UI
  private updateContextPills(): void {
    const pills: ContextPill[] = []

    // Current file
    if (this.currentFile) {
      const fileName = this.currentFile.split('/').pop() || this.currentFile
      pills.push({ type: 'file', label: fileName, value: this.currentFile })
    }

    // Active agents
    const runningCount = this.activeAgents.filter(a => a.status === 'running').length
    if (runningCount > 0) {
      pills.push({ type: 'agents', label: `${runningCount} agent${runningCount > 1 ? 's' : ''}`, value: String(runningCount) })
    }

    this.contextPills = pills
  }

  getContextPills(): ContextPill[] {
    return [...this.contextPills]
  }

  // LLM context formatting
  formatContextForLLM(): string {
    const parts: string[] = []

    if (this.currentFile) {
      parts.push(`Current file: ${this.currentFile}`)
    }

    if (this.activeAgents.length > 0) {
      const agentList = this.activeAgents.map(a => `${a.name} (${a.status})`).join(', ')
      parts.push(`Active agents: ${agentList}`)
    }

    const recentMessages = this.messages
      .slice(-5)
      .map(m => `${m.role}: ${m.content.slice(0, 100)}`)
      .join('\n')
    
    if (recentMessages) {
      parts.push(`Recent chat:\n${recentMessages}`)
    }

    return parts.join('\n')
  }

  // Agent orchestration integration
  async dispatchTask(task: string, modes: string[]): Promise<{ agents: string[]; taskId: string }> {
    // This would integrate with Loom's actual agent orchestration
    // For now, return mock dispatch
    const agents = modes.includes('agents') 
      ? ['CodeSmith', 'SpecWriter', 'Verifier']
      : ['CodeSmith']

    return {
      agents,
      taskId: `task-${Date.now()}`,
    }
  }

  // Export chat for persistence
  serialize(): string {
    return JSON.stringify({
      messages: this.messages,
      currentFile: this.currentFile,
      activeAgents: this.activeAgents,
    })
  }

  // Import chat from persistence
  deserialize(data: string): void {
    try {
      const parsed = JSON.parse(data)
      this.messages = parsed.messages || []
      this.currentFile = parsed.currentFile || ''
      this.activeAgents = parsed.activeAgents || []
      this.updateContextPills()
    } catch {
      // Ignore parse errors
    }
  }
}
