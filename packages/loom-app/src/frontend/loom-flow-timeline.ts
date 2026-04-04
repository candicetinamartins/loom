import { injectable, inject } from 'inversify'
import { FrontendApplicationContribution, WidgetManager } from '@theia/core/lib/browser'
import { EditorManager } from '@theia/editor/lib/browser/editor-manager'
import { FlowTimelineWidget } from '@loom/ui'
import { FlowTrackingService } from '@loom/core'

@injectable()
export class LoomFlowTimelineContribution implements FrontendApplicationContribution {
  private timelineWidget: FlowTimelineWidget | null = null

  constructor(
    @inject(WidgetManager) private widgetManager: WidgetManager,
    @inject(EditorManager) private editorManager: EditorManager,
    @inject(FlowTrackingService) private flowService: FlowTrackingService
  ) {}

  async onStart(): Promise<void> {
    // Subscribe to flow events to update timeline
    this.flowService.subscribe((event: { id: string; type: string; timestamp: number; [key: string]: any }) => {
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

        // Update intent label
        const context = this.flowService.inferIntent()
        this.timelineWidget.setIntent(context.intent, context.confidence)
      }
    })

    // Position timeline when editors open
    this.editorManager.onCreated(editorWidget => {
      this.positionTimelineAboveEditor(editorWidget)
    })
  }

  private positionTimelineAboveEditor(editorWidget: unknown): void {
    // Create timeline widget if not exists
    if (!this.timelineWidget) {
      this.timelineWidget = new FlowTimelineWidget()
      this.timelineWidget.id = 'loom-flow-timeline'
      this.timelineWidget.title.label = 'Flow'
    }

    // Theia's editor widget structure:
    // MainAreaWidget -> EditorWidget -> Monaco editor
    // We need to inject our widget between the toolbar and editor

    const widget = editorWidget as { node: HTMLElement; toolbar?: HTMLElement }
    if (widget.node) {
      // Check if timeline already inserted
      const existing = widget.node.querySelector('#loom-flow-timeline')
      if (!existing) {
        // Insert as first child before the editor content
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
