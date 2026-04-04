// Loom Frontend Entry Point
import { ContainerModule } from 'inversify'
import type { FrontendApplicationContribution } from '@theia/core/lib/browser'
import { LoomFrontendContribution } from './loom-frontend-contribution'

const FrontendContributionSymbol = Symbol.for('FrontendApplicationContribution')

export default new ContainerModule((bind) => {
  bind<FrontendApplicationContribution>(FrontendContributionSymbol).to(LoomFrontendContribution).inSingletonScope()
})
