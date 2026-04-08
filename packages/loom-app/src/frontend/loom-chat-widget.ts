import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'

export interface ChatMessage {
  id: string
  role: 'user' | 'loom'
  content: string
  timestamp: number
  context?: ContextPill[]
  agentDispatches?: AgentDispatch[]
  actions?: MessageAction[]
  checkpoint?: CheckpointCard
}

export interface CheckpointCard {
  id: string
  agentName: string
  label: string
  timestamp: number
  files: Array<{ path: string; hasContent: boolean }>
}

export interface ContextPill {
  type: 'file' | 'test' | 'agents' | 'custom'
  label: string
  value: string
}

export interface AgentDispatch {
  id: string
  name: string
  status: 'running' | 'waiting' | 'done' | 'quarantine'
  progress: { current: number; total: number }
}

export interface MessageAction {
  id: string
  label: string
  type: 'primary' | 'ghost'
  handler: () => void
}

export interface ChatMode {
  id: string
  label: string
  active: boolean
}

/**
 * LoomChatWidget - Custom chat panel for Loom IDE
 * 
 * A Windsurf/Cascade-style chat interface with:
 * - Context pills showing current codebase state
 * - Agent dispatch cards for running agents
 * - CODE/ASK mode switching
 * - Message history with code highlighting
 */
export class LoomChatWidget extends Widget {
  static readonly ID = 'loom-chat-widget'
  static readonly LABEL = 'Chat'

  private messages: ChatMessage[] = []
  private contextPills: ContextPill[] = []
  private modes: ChatMode[] = [
    { id: 'codebase', label: '@codebase', active: true },
    { id: 'agents', label: '@agents', active: true },
    { id: 'docs', label: '@docs', active: false },
  ]
  private onSendMessage: ((text: string, modes: string[]) => void) | null = null
  private onRestoreCheckpoint: ((checkpointId: string) => void) | null = null
  private typingIndicator = false

  constructor() {
    super()
    this.id = LoomChatWidget.ID
    this.title.label = LoomChatWidget.LABEL
    this.title.caption = 'Loom Chat'
    this.title.closable = true
    this.addClass('loom-chat-widget')
    this._applyContainerStyles()
    this._createBaseStructure()
  }

  setSendHandler(handler: (text: string, modes: string[]) => void): void {
    this.onSendMessage = handler
  }

  setRestoreCheckpointHandler(handler: (checkpointId: string) => void): void {
    this.onRestoreCheckpoint = handler
  }

  addMessage(message: ChatMessage): void {
    this.messages.push(message)
    this._renderMessages()
  }

  updateContextPills(pills: ContextPill[]): void {
    this.contextPills = pills
    this._renderContextBar()
  }

  setTypingIndicator(typing: boolean): void {
    this.typingIndicator = typing
    this._renderMessages()
  }

  updateAgentDispatch(messageId: string, dispatches: AgentDispatch[]): void {
    const msg = this.messages.find(m => m.id === messageId)
    if (msg) {
      msg.agentDispatches = dispatches
      this._renderMessages()
    }
  }

  clear(): void {
    this.messages = []
    this._renderMessages()
  }

  private _applyContainerStyles(): void {
    this.node.style.cssText = [
      'height:100%',
      'overflow:hidden',
      'background:var(--theia-sideBar-background,#181825)',
      'display:flex',
      'flex-direction:column',
    ].join(';')
  }

  private _createBaseStructure(): void {
    // Context bar
    const contextBar = document.createElement('div')
    contextBar.className = 'loom-chat-context-bar'
    contextBar.style.cssText = [
      'padding:6px 10px',
      'background:rgba(124,134,240,0.07)',
      'border-bottom:1px solid rgba(124,134,240,0.15)',
      'display:flex',
      'align-items:center',
      'gap:6px',
      'flex-shrink:0',
    ].join(';')
    contextBar.innerHTML = '<span class="ctx-label" style="font-size:10px;color:var(--theia-descriptionForeground,#6c7086)">ctx:</span>'
    contextBar.id = 'loom-chat-context-bar'
    this.node.appendChild(contextBar)

    // Messages area
    const messagesArea = document.createElement('div')
    messagesArea.className = 'loom-chat-messages'
    messagesArea.style.cssText = [
      'flex:1',
      'overflow-y:auto',
      'padding:10px 10px',
      'display:flex',
      'flex-direction:column',
      'gap:14px',
    ].join(';')
    messagesArea.id = 'loom-chat-messages'
    this.node.appendChild(messagesArea)

    // Input area
    const inputArea = document.createElement('div')
    inputArea.className = 'loom-chat-input-area'
    inputArea.style.cssText = [
      'padding:8px',
      'border-top:1px solid var(--theia-widget-border,#333)',
      'background:var(--theia-sideBar-background,#181825)',
      'flex-shrink:0',
    ].join(';')
    inputArea.appendChild(this._createInputBox())
    this.node.appendChild(inputArea)
  }

  private _createInputBox(): HTMLElement {
    const box = document.createElement('div')
    box.style.cssText = [
      'background:var(--theia-input-background,#252526)',
      'border:1px solid var(--theia-input-border,#3c3c3c)',
      'border-radius:8px',
      'padding:8px 10px',
      'display:flex',
      'flex-direction:column',
      'gap:6px',
      'transition:border-color 150ms',
    ].join(';')

    // Textarea
    const textarea = document.createElement('textarea')
    textarea.className = 'loom-chat-textarea'
    textarea.placeholder = 'Ask Loom to write, fix, explain, or refactor…'
    textarea.style.cssText = [
      'background:transparent',
      'border:none',
      'outline:none',
      'color:var(--theia-foreground,#d4d4d4)',
      'font-family:var(--theia-ui-font-family)',
      'font-size:12px',
      'line-height:1.5',
      'resize:none',
      'min-height:52px',
      'max-height:120px',
      'width:100%',
    ].join(';')

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this._sendMessage(textarea)
      }
    })

    // Footer with modes and send
    const footer = document.createElement('div')
    footer.style.cssText = [
      'display:flex',
      'align-items:center',
      'gap:6px',
    ].join(';')

    // Mode pills
    const modePills = document.createElement('div')
    modePills.style.cssText = 'display:flex;gap:4px;flex:1;'
    this.modes.forEach(mode => {
      const pill = document.createElement('span')
      pill.className = `cmode-pill ${mode.active ? 'on' : ''}`
      pill.textContent = mode.label
      pill.style.cssText = [
        'padding:2px 8px',
        'border-radius:9999px',
        'font-size:10px',
        'border:1px solid var(--theia-button-border,#3c3c3c)',
        'color:var(--theia-descriptionForeground,#6c7086)',
        'cursor:pointer',
        mode.active ? 'background:rgba(124,134,240,0.12);border-color:rgba(124,134,240,0.35);color:#7c86f0;' : '',
      ].join(';')
      pill.addEventListener('click', () => {
        mode.active = !mode.active
        this._renderInputArea()
      })
      modePills.appendChild(pill)
    })

    // Send button
    const sendBtn = document.createElement('button')
    sendBtn.innerHTML = '↑'
    sendBtn.style.cssText = [
      'width:26px',
      'height:26px',
      'background:#7c86f0',
      'border:none',
      'border-radius:6px',
      'color:#fff',
      'font-size:13px',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'flex-shrink:0',
    ].join(';')
    sendBtn.addEventListener('click', () => this._sendMessage(textarea))

    footer.appendChild(modePills)
    footer.appendChild(sendBtn)

    box.appendChild(textarea)
    box.appendChild(footer)

    return box
  }

  private _sendMessage(textarea: HTMLTextAreaElement): void {
    const text = textarea.value.trim()
    if (!text || !this.onSendMessage) return

    const activeModes = this.modes.filter(m => m.active).map(m => m.id)
    this.onSendMessage(text, activeModes)
    textarea.value = ''
  }

  private _renderContextBar(): void {
    const bar = this.node.querySelector('#loom-chat-context-bar')
    if (!bar) return

    // Clear existing pills (keep label)
    while (bar.children.length > 1) {
      bar.removeChild(bar.lastChild!)
    }

    this.contextPills.forEach(pill => {
      const el = document.createElement('span')
      el.className = 'ctx-pill'
      el.textContent = pill.label
      el.style.cssText = [
        'font-size:10px',
        'padding:1px 6px',
        'border-radius:9999px',
        'background:rgba(124,134,240,0.12)',
        'border:1px solid rgba(124,134,240,0.25)',
        'color:#7c86f0',
        'white-space:nowrap',
      ].join(';')
      bar.appendChild(el)
    })
  }

  private _renderMessages(): void {
    const container = this.node.querySelector('#loom-chat-messages')
    if (!container) return

    container.innerHTML = ''

    this.messages.forEach(msg => {
      container.appendChild(this._renderMessage(msg))
    })

    if (this.typingIndicator) {
      container.appendChild(this._renderTypingIndicator())
    }

    // Scroll to bottom
    container.scrollTop = container.scrollHeight
  }

  private _renderMessage(msg: ChatMessage): HTMLElement {
    const msgEl = document.createElement('div')
    msgEl.className = 'loom-msg'
    msgEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;'

    // Header
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:6px;'

    const avatar = document.createElement('div')
    avatar.style.cssText = [
      'width:20px',
      'height:20px',
      'border-radius:50%',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-size:10px',
      'flex-shrink:0',
    ].join(';')

    if (msg.role === 'user') {
      avatar.style.background = '#3a3a5c'
      avatar.style.color = '#7c86f0'
      avatar.textContent = 'C'
    } else {
      avatar.style.background = 'rgba(124,134,240,0.2)'
      avatar.style.color = '#7c86f0'
      avatar.style.border = '1px solid rgba(124,134,240,0.3)'
      avatar.textContent = '◈'
    }

    const name = document.createElement('span')
    name.style.cssText = `font-size:11px;font-weight:600;color:${msg.role === 'user' ? 'var(--theia-descriptionForeground,#6c7086)' : '#7c86f0'};`
    name.textContent = msg.role === 'user' ? 'You' : 'Loom'

    const time = document.createElement('span')
    time.style.cssText = 'font-size:10px;color:var(--theia-disabledForeground,#464646);margin-left:auto;'
    time.textContent = this._relTime(msg.timestamp)

    header.appendChild(avatar)
    header.appendChild(name)
    header.appendChild(time)
    msgEl.appendChild(header)

    // Body
    const body = document.createElement('div')
    body.style.cssText = [
      'padding:8px 10px',
      'border-radius:6px',
      'font-size:12px',
      'line-height:1.6',
      'margin-left:26px',
      msg.role === 'user' 
        ? 'background:#2a2a3e;border:1px solid rgba(124,134,240,0.2);color:var(--theia-foreground,#d4d4d4);'
        : 'background:var(--theia-editor-background,#1e1e2e);border:1px solid var(--theia-widget-border,#333);color:var(--theia-foreground,#d4d4d4);',
    ].join(';')
    body.innerHTML = this._formatContent(msg.content)
    msgEl.appendChild(body)

    // Agent dispatch card
    if (msg.agentDispatches && msg.agentDispatches.length > 0) {
      msgEl.appendChild(this._renderAgentDispatch(msg.agentDispatches))
    }

    // Checkpoint card (Windsurf-style)
    if (msg.checkpoint) {
      msgEl.appendChild(this._renderCheckpointCard(msg.checkpoint))
    }

    // Action buttons
    if (msg.actions && msg.actions.length > 0) {
      const actionsRow = document.createElement('div')
      actionsRow.style.cssText = 'display:flex;gap:6px;margin-top:6px;margin-left:26px;'
      msg.actions.forEach(action => {
        const btn = document.createElement('button')
        btn.textContent = action.label
        btn.style.cssText = [
          'padding:3px 10px',
          'border-radius:4px',
          'font-size:11px',
          'cursor:pointer',
          'border:1px solid',
          'font-family:var(--theia-ui-font-family)',
          action.type === 'primary'
            ? 'background:rgba(124,134,240,0.12);border-color:rgba(124,134,240,0.4);color:#7c86f0;'
            : 'background:transparent;border-color:var(--theia-widget-border,#333);color:var(--theia-descriptionForeground,#6c7086);',
        ].join(';')
        btn.addEventListener('click', action.handler)
        actionsRow.appendChild(btn)
      })
      msgEl.appendChild(actionsRow)
    }

    return msgEl
  }

  private _renderAgentDispatch(dispatches: AgentDispatch[]): HTMLElement {
    const card = document.createElement('div')
    card.style.cssText = [
      'margin-top:6px',
      'margin-left:26px',
      'background:#1e2a1e',
      'border:1px solid rgba(78,201,176,0.25)',
      'border-radius:6px',
      'padding:8px 10px',
    ].join(';')

    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;font-size:11px;color:#4ec9b0;'
    header.innerHTML = '⚡ Dispatching ' + dispatches.length + ' agent' + (dispatches.length > 1 ? 's' : '')
    card.appendChild(header)

    dispatches.forEach(agent => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:3px;font-size:11px;'

      const statusColor = agent.status === 'running' ? '#4db6ac' : 
                         agent.status === 'quarantine' ? '#e2c08d' : 
                         agent.status === 'done' ? '#66bb6a' : '#5a5a5a'

      row.innerHTML = `
        <span style="color:${statusColor}">●</span>
        <span style="color:var(--theia-foreground,#d4d4d4);flex:1;">${agent.name}</span>
        <span style="font-size:10px;color:var(--theia-descriptionForeground,#6c7086);">${agent.status} · ${agent.progress.current}/${agent.progress.total}</span>
      `
      card.appendChild(row)
    })

    return card
  }

  private _renderCheckpointCard(checkpoint: CheckpointCard): HTMLElement {
    const card = document.createElement('div')
    card.style.cssText = [
      'margin-top:6px',
      'margin-left:26px',
      'background:#2a1e3e',
      'border:1px solid rgba(124,134,240,0.3)',
      'border-radius:6px',
      'padding:8px 10px',
      'display:flex',
      'align-items:center',
      'gap:8px',
    ].join(';')

    // Agent avatar/name
    const agentInfo = document.createElement('div')
    agentInfo.style.cssText = 'display:flex;align-items:center;gap:6px;'
    agentInfo.innerHTML = `
      <span style="width:18px;height:18px;border-radius:50%;background:rgba(124,134,240,0.2);display:flex;align-items:center;justify-content:center;font-size:9px;color:#7c86f0;">${checkpoint.agentName.charAt(0).toUpperCase()}</span>
      <span style="font-size:11px;color:#7c86f0;font-weight:500;">${checkpoint.agentName}</span>
    `
    card.appendChild(agentInfo)

    // Label
    const label = document.createElement('span')
    label.style.cssText = 'font-size:11px;color:var(--theia-foreground,#d4d4d4);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
    label.textContent = checkpoint.label
    card.appendChild(label)

    // File count
    const fileCount = document.createElement('span')
    fileCount.style.cssText = 'font-size:10px;color:var(--theia-descriptionForeground,#6c7086);'
    fileCount.textContent = `${checkpoint.files.length} file${checkpoint.files.length !== 1 ? 's' : ''}`
    card.appendChild(fileCount)

    // Time
    const time = document.createElement('span')
    time.style.cssText = 'font-size:10px;color:var(--theia-disabledForeground,#464646);'
    time.textContent = this._relTime(checkpoint.timestamp)
    card.appendChild(time)

    // Restore button
    const restoreBtn = document.createElement('button')
    restoreBtn.textContent = 'Restore'
    restoreBtn.style.cssText = [
      'padding:2px 8px',
      'border-radius:4px',
      'font-size:10px',
      'cursor:pointer',
      'border:1px solid rgba(124,134,240,0.4)',
      'background:rgba(124,134,240,0.12)',
      'color:#7c86f0',
    ].join(';')
    restoreBtn.addEventListener('click', () => {
      if (this.onRestoreCheckpoint) {
        this.onRestoreCheckpoint(checkpoint.id)
      }
    })
    card.appendChild(restoreBtn)

    return card
  }

  private _renderTypingIndicator(): HTMLElement {
    const el = document.createElement('div')
    el.style.cssText = 'display:flex;align-items:center;gap:8px;padding:0 0 0 26px;'
    el.innerHTML = `
      <div style="display:flex;gap:3px;align-items:center;">
        <div style="width:5px;height:5px;border-radius:50%;background:#7c86f0;animation:loom-typing-bounce 1.2s ease-in-out infinite;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:#7c86f0;animation:loom-typing-bounce 1.2s ease-in-out infinite;animation-delay:0.2s;"></div>
        <div style="width:5px;height:5px;border-radius:50%;background:#7c86f0;animation:loom-typing-bounce 1.2s ease-in-out infinite;animation-delay:0.4s;"></div>
      </div>
      <span style="font-size:11px;color:var(--theia-descriptionForeground,#6c7086);font-style:italic;">Loom is thinking…</span>
      <style>
        @keyframes loom-typing-bounce {
          0%,60%,100% { transform: translateY(0); opacity:0.4; }
          30% { transform: translateY(-4px); opacity:1; }
        }
      </style>
    `
    return el
  }

  private _renderInputArea(): void {
    // Re-render the input area when modes change
    const inputArea = this.node.querySelector('.loom-chat-input-area')
    if (inputArea) {
      inputArea.innerHTML = ''
      inputArea.appendChild(this._createInputBox())
    }
  }

  private _formatContent(content: string): string {
    // Simple code formatting - wrap code blocks
    return content
      .replace(/`([^`]+)`/g, '<code style="color:#4ec9b0;background:rgba(78,201,176,0.1);padding:1px 4px;border-radius:3px;font-family:var(--theia-monospace-font-family);">$1</code>')
      .replace(/\n/g, '<br>')
  }

  private _relTime(ts: number): string {
    const diff = Date.now() - ts
    const s = Math.floor(diff / 1000)
    if (s < 60) return 'just now'
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return new Date(ts).toLocaleDateString()
  }
}
