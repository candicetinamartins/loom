import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell } from '@theia/core/lib/browser'
import { MemoryPanelWidget } from '@loom/ui'
import { MemoryService } from '@loom/memory'

export const MEMORY_PANEL_WIDGET_ID = 'loom-memory-panel'

/**
 * LoomMemoryPanelContribution - Registers Memory Panel in Theia
 * 
 * Provides:
 * - Memory browser panel in right sidebar
 * - Working Graph memory search/filter
 * - Integration with Kuzu graph database
 */
@injectable()
export class LoomMemoryPanelContribution extends AbstractViewContribution<MemoryPanelWidget> {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell,
    @inject(MemoryService) private memoryService: MemoryService,
  ) {
    super({
      widgetId: MEMORY_PANEL_WIDGET_ID,
      widgetName: 'Memories',
      defaultWidgetOptions: {
        area: 'right',
        rank: 60,
      },
      toggleCommandId: 'loom.toggleMemoryPanel',
    })
  }

  async openView(options?: { activate?: boolean; reveal?: boolean }): Promise<MemoryPanelWidget> {
    const widget = await super.openView(options)
    return widget
  }
}
