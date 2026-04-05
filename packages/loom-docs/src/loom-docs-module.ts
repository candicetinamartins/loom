import { ContainerModule } from 'inversify'
import { LoomDocsService } from './LoomDocsService'

export const DOCS_TYPES = {
  LoomDocsService: 'LoomDocsService',
} as const

export default new ContainerModule((bind) => {
  bind(DOCS_TYPES.LoomDocsService).to(LoomDocsService).inSingletonScope()
})
