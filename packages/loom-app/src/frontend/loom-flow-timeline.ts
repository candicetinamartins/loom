import { injectable, inject } from 'inversify'
import { Widget } from '@lumino/widgets'
import { Message } from '@lumino/messaging'
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution'
import { EditorManager } from '@theia/editor/lib/browser/editor-manager'

interface FlowEvent {
  id: string
  type: string
  timestamp: number
  color: string
  label: string
}

interface FlowTrackingService {
  subscribe(callback: (event: { id: string; type: string; timestamp: number; filePath?: string }) => void): void
  inferIntent(): { intent: string; confidence: number }
}

/**
 * FlowTimelineWidget — Lumino widget showing real-time flow events above editors
 */
class FlowTimelineWidget extends Widget {
  static readonly ID = 'loom-flow-timeline'
  private events: FlowEvent[] = []
  private intentLabel: HTMLElement

  constructor() {
    super()
    this.id = FlowTimelineWidget.ID
    this.addClass('loom-flow-timeline')
    this._applyContainerStyles()

    // Create intent label
    this.intentLabel = document.createElement('div')
    this.intentLabel.className = 'loom-flow-intent'
    this.intentLabel.style.cssText = [
      'padding:4px 12px',
      'font-size:11px',
      'font-weight:600',
      'color:var(--theia-foreground,#cdd6f4)',
      'background:var(--theia-editor-background,#1e1e2e)',
      'border-bottom:1px solid var(--theia-widget-border,#333)',
      'display:flex',
      'align-items:center',
      'gap:8px',
    ].join(';')
    this.node.appendChild(this.intentLabel)
  }

  addEvent(event: FlowEvent): void {
    this.events.unshift(event)
    if (this.events.length > 50) this.events.pop()
    this.update()
  }

  setIntent(intent: string, confidence: number): void {
    const confidencePercent = Math.round(confidence * 100)
    this.intentLabel.innerHTML = `◈ ${intent} <span style="opacity:0.6;font-weight:400">${confidencePercent}%</span>`
  }

  protected onUpdateRequest(_msg: Message): void {
    // Keep intent label, update event list
    const existingList = this.node.querySelector('.loom-flow-events')
    if (existingList) existingList.remove()

    if (this.events.length === 0) {
      this.intentLabel.textContent = '◈ Flow — waiting for activity...'
      return
    }

    const list = document.createElement('div')
    list.className = 'loom-flow-events'
    list.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'gap:4px',
      'padding:6px 12px',
      'background:var(--theia-editor-background,#1e1e2e)',
    ].join(';')

    // Show last 8 events as chips
    for (const event of this.events.slice(0, 8)) {
      const chip = document.createElement('span')
      chip.style.cssText = [
        'padding:2px 8px',
        'border-radius:3px',
        'font-size:10px',
        'font-family:monospace',
        'background:' + event.color + '20',
        'color:' + event.color,
        'border:1px solid ' + event.color + '40',
      ].join(';')
      chip.textContent = event.label
      chip.title = `${event.type} — ${new Date(event.timestamp).toLocaleTimeString()}`
      list.appendChild(chip)
    }

    this.node.appendChild(list)
  }

  private _applyContainerStyles(): void {
    this.node.style.cssText = [
      'width:100%',
      'flex-shrink:0',
    ].join(';')
  }
}

@injectable()
export class LoomFlowTimelineContribution implements FrontendApplicationContribution {
  private timelineWidget: FlowTimelineWidget | null = null

  constructor(
    @inject(EditorManager) private editorManager: EditorManager,
    @inject('FlowTrackingService') private flowService: FlowTrackingService
  ) {}

  async onStart(): Promise<void> {
    // Subscribe to flow events
    this.flowService.subscribe((event) => {
      if (this.timelineWidget) {
        const color = this.getEventColor(event.type)
        const label = this.formatEventLabel(event)
        this.timelineWidget.addEvent({
          id: event.id,
          type: event.type,
          timestamp: event.timestamp,
          color,
          label,
        })

        const context = this.flowService.inferIntent()
        this.timelineWidget.setIntent(context.intent, context.confidence)
      }
    })

    // Position timeline when editors open
    this.editorManager.onCreated((editorWidget: { node: HTMLElement }) => {
      this.positionTimelineAboveEditor(editorWidget)
    })
  }

  private positionTimelineAboveEditor(editorWidget: { node: HTMLElement }): void {
    if (!this.timelineWidget) {
      this.timelineWidget = new FlowTimelineWidget()
    }

    const widget = editorWidget as { node: HTMLElement }
    if (widget.node) {
      const existing = widget.node.querySelector('#loom-flow-timeline')
      if (!existing) {
        const content = widget.node.querySelector('.monaco-editor')?.parentElement
        if (content && content.parentElement) {
          content.parentElement.insertBefore(this.timelineWidget.node, content)
        }
      }
    }
  }

  private getEventColor(type: string): string {
    const colors: Record<string, string> = {
      file_open: '#4CAF50',
      file_edit: '#2196F3',
      file_save: '#9C27B0',
      terminal_output: '#FF9800',
      test_run: '#F44336',
      git_commit: '#795548',
      selection_change: '#607D8B',
      diagnostic_change: '#E91E63',
      command_run: '#3F51B5',
    }
    return colors[type] || '#757575'
  }

  private formatEventLabel(event: { type: string; filePath?: string }): string {
    if (event.filePath) {
      const filename = event.filePath.split('/').pop() || event.filePath.split('\\').pop() || ''
      return `${event.type}:${filename.substring(0, 10)}`
    }
    return event.type
  }
}
