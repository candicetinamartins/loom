import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { VerifierStatusBarWidget } from '@loom/ui'

export const VERIFIER_STATUS_WIDGET_ID = 'loom-verifier-status'

@injectable()
export class LoomVerifierStatusContribution extends AbstractViewContribution<VerifierStatusBarWidget> implements FrontendApplicationContribution {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: VERIFIER_STATUS_WIDGET_ID,
      widgetName: 'Verifier Status',
      defaultWidgetOptions: {
        area: 'bottom',
        rank: 100,
      },
      toggleCommandId: 'loom.toggleVerifierStatus',
    })
  }

  async onStart(): Promise<void> {
    console.log('[LoomVerifierStatusContribution] Initialized')
  }
}
