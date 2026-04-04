// Loom Backend Entry Point
import { ContainerModule } from 'inversify'
import type { BackendApplicationContribution } from '@theia/core/lib/node'
import { LoomBackendContribution } from './loom-backend-contribution'

const BackendContributionSymbol = Symbol.for('BackendApplicationContribution')

export default new ContainerModule((bind) => {
  bind<BackendApplicationContribution>(BackendContributionSymbol).to(LoomBackendContribution).inSingletonScope()
})
