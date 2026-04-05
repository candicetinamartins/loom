import { ContainerModule } from 'inversify'
import { MemoryService } from './MemoryService'
import { MemoryIsolationService } from './MemoryIsolationService'

export const MEMORY_TYPES = {
  MemoryService: 'MemoryService',
  MemoryIsolationService: 'MemoryIsolationService',
} as const

export default new ContainerModule((bind) => {
  bind(MEMORY_TYPES.MemoryService).to(MemoryService).inSingletonScope()
  bind(MEMORY_TYPES.MemoryIsolationService).to(MemoryIsolationService).inSingletonScope()
})
