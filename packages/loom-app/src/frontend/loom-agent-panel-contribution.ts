import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { AgentPanelWidget } from '@loom/ui'

export const AGENT_PANEL_WIDGET_ID = 'loom-agent-panel'

@injectable()
export class LoomAgentPanelContribution extends AbstractViewContribution<AgentPanelWidget> implements FrontendApplicationContribution {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: AGENT_PANEL_WIDGET_ID,
      widgetName: 'Agent Panel',
      defaultWidgetOptions: {
        area: 'right',
        rank: 100,
      },
      toggleCommandId: LOOM_COMMANDS.TOGGLE_AGENT_PANEL.id,
    })
  }

  async onStart(): Promise<void> {
    // Widget factory is registered via Theia's WidgetManager automatically
    console.log('[LoomAgentPanelContribution] Initialized')
  }

  async initializeLayout(): Promise<void> {
    // Open the agent panel on first launch
    await this.openView({
      activate: false,
      reveal: true,
    })
  }
}
