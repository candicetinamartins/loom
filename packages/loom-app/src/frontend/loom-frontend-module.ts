import { ContainerModule } from 'inversify'
import { FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LoomFrontendContribution } from './loom-frontend-contribution'
import { LoomFlowContribution } from './loom-flow-contribution'
import { LoomFlowTimelineContribution } from './loom-flow-timeline'
import { LoomFlowContextContributor } from './loom-flow-context'
import { LoomStatusBarContribution } from './loom-status-bar'
import { LoomStatusBarService, LOOM_STATUSBAR_SYMBOL } from './loom-status-bar-service'
import { LoomThemeContribution } from './loom-theme-contribution'
import { LoomKeybindingContribution } from './loom-keybindings'

export default new ContainerModule((bind) => {
  // Main contributions
  bind(FrontendApplicationContribution).to(LoomFrontendContribution).inSingletonScope()
  bind(FrontendApplicationContribution).to(LoomFlowContribution).inSingletonScope()
  bind(FrontendApplicationContribution).to(LoomFlowTimelineContribution).inSingletonScope()
  bind(FrontendApplicationContribution).to(LoomFlowContextContributor).inSingletonScope()
  bind(FrontendApplicationContribution).to(LoomStatusBarContribution).inSingletonScope()
  bind(FrontendApplicationContribution).to(LoomThemeContribution).inSingletonScope()
  bind(FrontendApplicationContribution).to(LoomKeybindingContribution).inSingletonScope()

  // Services
  bind(LoomStatusBarService).toSelf().inSingletonScope()
  bind(LOOM_STATUSBAR_SYMBOL).toService(LoomStatusBarService)
})
