import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { CodemapWidget } from '@loom/ui'

export const CODEMAP_WIDGET_ID = 'loom-codemap'

@injectable()
export class LoomCodemapContribution extends AbstractViewContribution<CodemapWidget> implements FrontendApplicationContribution {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: CODEMAP_WIDGET_ID,
      widgetName: 'Codemap',
      defaultWidgetOptions: {
        area: 'left',
        rank: 200,
      },
      toggleCommandId: 'loom.toggleCodemap',
    })
  }

  async onStart(): Promise<void> {
    console.log('[LoomCodemapContribution] Initialized')
  }

  async initializeLayout(): Promise<void> {
    await this.openView({
      activate: false,
      reveal: true,
    })
  }
}
