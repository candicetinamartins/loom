export type FlowEventType =
  | 'file_open'
  | 'file_edit'
  | 'file_save'
  | 'terminal_output'
  | 'test_run'
  | 'git_commit'
  | 'selection_change'
  | 'diagnostic_change'
  | 'command_run'

export interface FlowEvent {
  id: string
  type: FlowEventType
  timestamp: number
  data: Record<string, unknown>
  filePath?: string
  agentName?: string
}

export type FlowIntent =
  | 'test_fix_cycle'
  | 'new_feature'
  | 'refactor'
  | 'debugging'
  | 'exploration'
  | 'documentation'

export interface FlowContext {
  intent: FlowIntent
  confidence: number
  recentEvents: FlowEvent[]
  summary: string
  tokenEstimate: number
  // UI state properties used by SystemPromptBuilder
  activeFile?: string
  terminalActive?: boolean
  recentDiagnostics?: string[]
}

const RING_BUFFER_SIZE = 1000
const MAX_AGE_MS = 30 * 60 * 1000 // 30 minutes

export class FlowTrackingService {
  private ringBuffer: FlowEvent[] = new Array(RING_BUFFER_SIZE)
  private head = 0
  private count = 0
  private subscribers: Set<(event: FlowEvent) => void> = new Set()

  // Event tracking
  trackEvent(type: FlowEventType, data: Record<string, unknown>, filePath?: string): void {
    const event: FlowEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: Date.now(),
      data,
      filePath,
    }

    this.ringBuffer[this.head] = event
    this.head = (this.head + 1) % RING_BUFFER_SIZE
    if (this.count < RING_BUFFER_SIZE) {
      this.count++
    }

    this.subscribers.forEach(cb => cb(event))
  }

  // Get recent events within time window
  getRecentEvents(maxAgeMs: number = MAX_AGE_MS): FlowEvent[] {
    const cutoff = Date.now() - maxAgeMs
    const events: FlowEvent[] = []

    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - 1 - i + RING_BUFFER_SIZE) % RING_BUFFER_SIZE
      const event = this.ringBuffer[idx]
      if (event && event.timestamp > cutoff) {
        events.push(event)
      }
    }

    return events.reverse()
  }

  // Get events by type
  getEventsByType(type: FlowEventType, limit: number = 50): FlowEvent[] {
    return this.getRecentEvents()
      .filter(e => e.type === type)
      .slice(0, limit)
  }

  // Subscribe to events
  subscribe(callback: (event: FlowEvent) => void): () => void {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  // Get current flow context (used by SystemPromptBuilder)
  getCurrentContext(): FlowContext | null {
    return this.inferIntent()
  }

  // Intent inference
  inferIntent(): FlowContext {
    const events = this.getRecentEvents(5 * 60 * 1000) // Look at last 5 minutes
    const fileEditEvents = events.filter(e => e.type === 'file_edit')
    const testEvents = events.filter(e => e.type === 'test_run')
    const diagnosticEvents = events.filter(e => e.type === 'diagnostic_change')

    // Test-fix cycle detection
    if (testEvents.length > 0 && diagnosticEvents.length > 0) {
      const lastTest = testEvents[0]
      const lastDiagnostic = diagnosticEvents[0]
      if (Math.abs(lastTest.timestamp - lastDiagnostic.timestamp) < 60000) {
        return {
          intent: 'test_fix_cycle',
          confidence: 0.85,
          recentEvents: events.slice(0, 10),
          summary: 'Working through test failures and fixing code',
          tokenEstimate: 150,
          activeFile: fileEditEvents[0]?.filePath,
          terminalActive: events.some(e => e.type === 'terminal_output'),
          recentDiagnostics: diagnosticEvents.map(d => d.type),
        }
      }
    }

    // New feature detection (many new file opens/edits)
    if (fileEditEvents.length > 5) {
      const uniqueFiles = new Set(fileEditEvents.map(e => e.filePath)).size
      if (uniqueFiles > 2) {
        return {
          intent: 'new_feature',
          confidence: 0.75,
          recentEvents: events.slice(0, 10),
          summary: 'Building new functionality across multiple files',
          tokenEstimate: 150,
          activeFile: fileEditEvents[0]?.filePath,
          terminalActive: events.some(e => e.type === 'terminal_output'),
          recentDiagnostics: diagnosticEvents.map(d => d.type),
        }
      }
    }

    // Refactor detection (many edits, few diagnostics)
    if (fileEditEvents.length > 10 && diagnosticEvents.length === 0) {
      return {
        intent: 'refactor',
        confidence: 0.7,
        recentEvents: events.slice(0, 10),
        summary: 'Refactoring code structure',
        tokenEstimate: 150,
        activeFile: fileEditEvents[0]?.filePath,
        terminalActive: events.some(e => e.type === 'terminal_output'),
        recentDiagnostics: diagnosticEvents.map(d => d.type),
      }
    }

    // Debugging detection (terminal focus, diagnostic changes)
    if (events.some(e => e.type === 'terminal_output') && diagnosticEvents.length > 0) {
      return {
        intent: 'debugging',
        confidence: 0.7,
        recentEvents: events.slice(0, 10),
        summary: 'Debugging and investigating issues',
        tokenEstimate: 150,
        activeFile: fileEditEvents[0]?.filePath,
        terminalActive: true,
        recentDiagnostics: diagnosticEvents.map(d => d.type),
      }
    }

    // Default: exploration
    return {
      intent: 'exploration',
      confidence: 0.5,
      recentEvents: events.slice(0, 10),
      summary: 'Exploring codebase',
      tokenEstimate: 100,
      activeFile: fileEditEvents[0]?.filePath,
      terminalActive: events.some(e => e.type === 'terminal_output'),
      recentDiagnostics: diagnosticEvents.map(d => d.type),
    }
  }

  // Format for LLM context (≤150 tokens)
  formatContextForLLM(): string {
    const context = this.inferIntent()
    const events = context.recentEvents
      .slice(0, 5)
      .map(e => `${e.type}${e.filePath ? `:${e.filePath.split('/').pop()}` : ''}`)
      .join(', ')

    return `Intent: ${context.intent} | Recent: ${events}`
  }

  // Clear old events
  clear(): void {
    this.ringBuffer = new Array(RING_BUFFER_SIZE)
    this.head = 0
    this.count = 0
  }
}
