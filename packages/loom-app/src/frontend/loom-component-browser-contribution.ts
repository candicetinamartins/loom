import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { ComponentBrowserWidget } from '@loom/ui'

export const COMPONENT_BROWSER_WIDGET_ID = 'loom-component-browser'

@injectable()
export class LoomComponentBrowserContribution extends AbstractViewContribution<ComponentBrowserWidget> implements FrontendApplicationContribution {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: COMPONENT_BROWSER_WIDGET_ID,
      widgetName: 'Component Browser',
      defaultWidgetOptions: {
        area: 'right',
        rank: 200,
      },
      toggleCommandId: 'loom.toggleComponentBrowser',
    })
  }

  async onStart(): Promise<void> {
    console.log('[LoomComponentBrowserContribution] Initialized')
  }
}
