import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { GhostTextWidget } from '@loom/ui'

export const GHOST_TEXT_WIDGET_ID = 'loom-ghost-text'

@injectable()
export class LoomGhostTextContribution extends AbstractViewContribution<GhostTextWidget> implements FrontendApplicationContribution {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: GHOST_TEXT_WIDGET_ID,
      widgetName: 'Ghost Text',
      defaultWidgetOptions: {
        area: 'main',
        rank: 1,
      },
      toggleCommandId: 'loom.toggleGhostText',
    })
  }

  async onStart(): Promise<void> {
    console.log('[LoomGhostTextContribution] Initialized')
  }
}
