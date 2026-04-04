// Loom Frontend Entry Point
import { ContainerModule } from 'inversify'
import { FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LoomFrontendContribution } from './loom-frontend-contribution'

export default new ContainerModule((bind) => {
  bind(FrontendApplicationContribution).to(LoomFrontendContribution).inSingletonScope()
})
