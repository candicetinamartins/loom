import { ContainerModule } from 'inversify'
import { SpecService } from './SpecService'
import { CommitService } from './CommitService'

export const SPEC_TYPES = {
  SpecService: 'SpecService',
  CommitService: 'CommitService',
} as const

export default new ContainerModule((bind) => {
  bind(SPEC_TYPES.SpecService).to(SpecService).inSingletonScope()
  bind(SPEC_TYPES.CommitService).to(CommitService).inSingletonScope()
})
