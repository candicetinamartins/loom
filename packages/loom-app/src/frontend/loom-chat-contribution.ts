import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { LoomChatWidget, ChatMessage, ContextPill, AgentDispatch } from './loom-chat-widget'
import { ChatService } from './chat-service'
import { FlowTrackingService } from '@loom/core'
import { EditorManager } from '@theia/editor/lib/browser/editor-manager'

export const CHAT_WIDGET_ID = 'loom-chat-widget'

/**
 * LoomChatContribution - Integrates Loom Chat into Theia shell
 * 
 * Provides:
 * - Chat panel in right sidebar
 * - Context-aware messaging with agent dispatch visualization
 * - Integration with FlowTrackingService for automatic context updates
 */
@injectable()
export class LoomChatContribution extends AbstractViewContribution<LoomChatWidget> implements FrontendApplicationContribution {
  private chatService: ChatService
  private _chatWidget: LoomChatWidget | null = null

  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell,
    @inject(FlowTrackingService) private flowService: FlowTrackingService,
    @inject(EditorManager) private editorManager: EditorManager,
  ) {
    super({
      widgetId: CHAT_WIDGET_ID,
      widgetName: 'Chat',
      defaultWidgetOptions: {
        area: 'right',
        rank: 50, // Higher rank = closer to top
      },
      toggleCommandId: LOOM_COMMANDS.NEW_CHAT.id,
    })

    // Create chat service
    this.chatService = new ChatService()
  }

  async onStart(): Promise<void> {
    console.log('[LoomChatContribution] Initializing chat...')

    // Subscribe to flow events for context updates
    this.flowService.subscribe((event) => {
      this.updateContextFromFlow(event)
    })

    // Subscribe to editor changes
    this.editorManager.onCurrentEditorChanged((editor: import('@theia/editor/lib/browser').EditorWidget | undefined) => {
      if (editor) {
        this.updateFileContext(editor.editor.document.uri.toString())
      }
    })

    // Initial context update
    this.updateContextPills()
  }

  async initializeLayout(): Promise<void> {
    // Open chat panel on first launch
    await this.openView({
      activate: false,
      reveal: true,
    })
  }

  protected async createWidget(): Promise<LoomChatWidget> {
    if (this._chatWidget) return this._chatWidget

    const widget = new LoomChatWidget()
    this._chatWidget = widget

    // Set up message handler
    widget.setSendHandler((text: string, modes: string[]) => {
      this.handleUserMessage(text, modes)
    })

    // Set up checkpoint restore handler
    widget.setRestoreCheckpointHandler((checkpointId: string) => {
      this.restoreCheckpoint(checkpointId)
    })

    // Load any existing messages from service
    const history = this.chatService.getHistory()
    history.forEach((msg: ChatMessage) => widget.addMessage(msg))

    return widget
  }

  private async handleUserMessage(text: string, modes: string[]): Promise<void> {
    if (!this._chatWidget) return

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    }
    this.chatService.addMessage(userMsg)
    this._chatWidget.addMessage(userMsg)

    // Show typing indicator
    this._chatWidget.setTypingIndicator(true)

    // Process based on modes
    if (modes.includes('agents')) {
      // Dispatch agents to handle the request
      await this.dispatchAgents(text, modes)
    } else {
      // Direct response
      await this.generateResponse(text, modes)
    }

    this._chatWidget.setTypingIndicator(false)
  }

  private async dispatchAgents(task: string, modes: string[]): Promise<void> {
    if (!this._chatWidget) return

    // Create loom response with agent dispatch
    const dispatchMsg: ChatMessage = {
      id: `loom-${Date.now()}`,
      role: 'loom',
      content: `I'll dispatch agents to handle this task: "${task}"`,
      timestamp: Date.now(),
      agentDispatches: [
        { id: '1', name: 'CodeSmith', status: 'running', progress: { current: 0, total: 5 } },
        { id: '2', name: 'SpecWriter', status: 'waiting', progress: { current: 0, total: 3 } },
      ],
      actions: [
        { id: 'stop', label: 'Stop agents', type: 'ghost', handler: () => this.stopAgents() },
      ],
    }

    this.chatService.addMessage(dispatchMsg)
    this._chatWidget.addMessage(dispatchMsg)

    // Simulate agent progress (replace with real agent orchestration)
    this.simulateAgentProgress(dispatchMsg.id)
  }

  private async generateResponse(text: string, modes: string[]): Promise<void> {
    if (!this._chatWidget) return

    // Generate contextual response based on modes
    let response = ''
    
    if (modes.includes('codebase')) {
      response = `Looking at the codebase context...\n\n`
    }

    response += `I understand you want: "${text}"\n\n`
    response += `Would you like me to:\n`
    response += `• Dispatch agents to implement this\n`
    response += `• Explain the relevant code\n`
    response += `• Show you the files involved`

    const loomMsg: ChatMessage = {
      id: `loom-${Date.now()}`,
      role: 'loom',
      content: response,
      timestamp: Date.now(),
      actions: [
        { id: 'dispatch', label: 'Dispatch agents', type: 'primary', handler: () => this.dispatchAgents(text, modes) },
        { id: 'explain', label: 'Explain code', type: 'ghost', handler: () => this.explainCode(text) },
      ],
    }

    this.chatService.addMessage(loomMsg)
    this._chatWidget.addMessage(loomMsg)
  }

  private simulateAgentProgress(messageId: string): void {
    if (!this._chatWidget) return

    // Simulate agent progress updates
    let progress = 0
    const interval = setInterval(() => {
      progress++
      const dispatches: AgentDispatch[] = [
        { id: '1', name: 'CodeSmith', status: progress > 3 ? 'done' : 'running', progress: { current: Math.min(progress, 5), total: 5 } },
        { id: '2', name: 'SpecWriter', status: progress > 1 ? 'running' : 'waiting', progress: { current: Math.max(0, progress - 2), total: 3 } },
      ]

      this._chatWidget!.updateAgentDispatch(messageId, dispatches)

      if (progress >= 8) {
        clearInterval(interval)
        // Add completion message
        const completionMsg: ChatMessage = {
          id: `loom-${Date.now()}`,
          role: 'loom',
          content: '✓ All agents completed their tasks. Files have been modified.',
          timestamp: Date.now(),
          actions: [
            { id: 'view', label: 'View diff', type: 'primary', handler: () => this.viewDiff() },
            { id: 'checkpoint', label: 'Create checkpoint', type: 'ghost', handler: () => this.createCheckpoint() },
          ],
        }
        this.chatService.addMessage(completionMsg)
        this._chatWidget!.addMessage(completionMsg)
      }
    }, 1500)
  }

  private updateContextFromFlow(event: { type: string; filePath?: string }): void {
    // Auto-update context based on flow events
    this.updateContextPills()
  }

  private updateFileContext(filePath: string): void {
    this.chatService.setCurrentFile(filePath)
    this.updateContextPills()
  }

  private updateContextPills(): void {
    if (!this._chatWidget) return

    const pills: ContextPill[] = []
    
    // Current file
    const currentFile = this.chatService.getCurrentFile()
    if (currentFile) {
      const fileName = currentFile.split('/').pop() || currentFile
      pills.push({ type: 'file', label: fileName, value: currentFile })
    }

    // Active agents count
    const agentCount = this.chatService.getActiveAgentCount()
    if (agentCount > 0) {
      pills.push({ type: 'agents', label: `${agentCount} agents`, value: String(agentCount) })
    }

    // Test status (mock)
    pills.push({ type: 'test', label: 'fleet.spec · 1 fail', value: 'test-fail' })

    this._chatWidget.updateContextPills(pills)
  }

  // Action handlers
  private stopAgents(): void {
    console.log('[LoomChat] Stopping agents...')
    // Implement agent stop logic
  }

  private explainCode(_text: string): void {
    if (!this._chatWidget) return
    
    const explainMsg: ChatMessage = {
      id: `loom-${Date.now()}`,
      role: 'loom',
      content: `Looking at \`FleetCoordinator.ts\`, I can see:\n\nThe retry logic currently catches errors but doesn't re-throw after MAX_RETRIES. The \`attempts\` counter increments but the error is swallowed.`,
      timestamp: Date.now(),
    }
    this.chatService.addMessage(explainMsg)
    this._chatWidget.addMessage(explainMsg)
  }

  private viewDiff(): void {
    // Open diff view
    console.log('[LoomChat] Opening diff view...')
  }

  private createCheckpoint(): void {
    // Create checkpoint
    console.log('[LoomChat] Creating checkpoint...')
  }

  private restoreCheckpoint(checkpointId: string): void {
    console.log('[LoomChat] Restoring checkpoint:', checkpointId)
    // TODO: Call backend CheckpointService.restoreCheckpoint(checkpointId)
    // This would revert all files to the checkpoint state
  }

  // Public API for other contributions
  sendMessage(text: string): void {
    void this.handleUserMessage(text, ['codebase', 'agents'])
  }

  clearChat(): void {
    this.chatService.clear()
    this._chatWidget?.clear()
  }
}
