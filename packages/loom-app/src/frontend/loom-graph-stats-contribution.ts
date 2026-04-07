import { injectable, inject } from 'inversify'
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution'
import { WidgetManager, ApplicationShell, FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LOOM_COMMANDS } from './loom-keybindings'
import { GraphStatsBarWidget } from '@loom/ui'

export const GRAPH_STATS_WIDGET_ID = 'loom-graph-stats'

@injectable()
export class LoomGraphStatsContribution extends AbstractViewContribution<GraphStatsBarWidget> implements FrontendApplicationContribution {
  constructor(
    @inject(WidgetManager) widgetManager: WidgetManager,
    @inject(ApplicationShell) shell: ApplicationShell
  ) {
    super({
      widgetId: GRAPH_STATS_WIDGET_ID,
      widgetName: 'Graph Stats',
      defaultWidgetOptions: {
        area: 'bottom',
        rank: 101,
      },
      toggleCommandId: 'loom.toggleGraphStats',
    })
  }

  async onStart(): Promise<void> {
    console.log('[LoomGraphStatsContribution] Initialized')
  }
}
