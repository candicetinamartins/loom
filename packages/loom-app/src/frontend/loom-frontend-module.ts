import { ContainerModule } from 'inversify'
import type { FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LoomFrontendContribution } from './loom-frontend-contribution'
import { LoomFlowContribution } from './loom-flow-contribution'
import { LoomFlowTimelineContribution } from './loom-flow-timeline'
import { LoomFlowContextContributor } from './loom-flow-context'
import { LoomStatusBarContribution } from './loom-status-bar'
import { LoomStatusBarService, LOOM_STATUSBAR_SYMBOL } from './loom-status-bar-service'
import { LoomThemeContribution } from './loom-theme-contribution'
import { LoomKeybindingContribution } from './loom-keybindings'

// Use symbol for DI injection since FrontendApplicationContribution is an interface
const FrontendContributionSymbol = Symbol.for('FrontendApplicationContribution')

export default new ContainerModule((bind) => {
  // Main contributions - bind to self with symbol
  bind(FrontendContributionSymbol).to(LoomFrontendContribution).inSingletonScope()
  bind(FrontendContributionSymbol).to(LoomFlowContribution).inSingletonScope()
  bind(FrontendContributionSymbol).to(LoomFlowTimelineContribution).inSingletonScope()
  bind(FrontendContributionSymbol).to(LoomFlowContextContributor).inSingletonScope()
  bind(FrontendContributionSymbol).to(LoomStatusBarContribution).inSingletonScope()
  bind(FrontendContributionSymbol).to(LoomThemeContribution).inSingletonScope()
  bind(FrontendContributionSymbol).to(LoomKeybindingContribution).inSingletonScope()

  // Services
  bind(LoomStatusBarService).toSelf().inSingletonScope()
  bind(LOOM_STATUSBAR_SYMBOL).toService(LoomStatusBarService)
})
