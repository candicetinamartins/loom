// Loom Backend Entry Point
import { ContainerModule } from 'inversify'
import { BackendApplicationContribution } from '@theia/core/lib/node'
import { LoomBackendContribution } from './backend/loom-backend-contribution'

export default new ContainerModule((bind) => {
  bind(BackendApplicationContribution).to(LoomBackendContribution).inSingletonScope()
})
