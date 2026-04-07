import { ContainerModule } from 'inversify'
import { MemoryService } from './MemoryService'
import { MemoryIsolationService } from './MemoryIsolationService'
import { SessionStore } from './tier1/SessionStore'
import { CheckpointStore } from './checkpoints/CheckpointStore'
import { CheckpointService } from './checkpoints/CheckpointService'
import { MemPalaceService } from './mempalace/MemPalaceService'

export const MEMORY_TYPES = {
  MemoryService: 'MemoryService',
  MemoryIsolationService: 'MemoryIsolationService',
  SessionStore: 'SessionStore',
  CheckpointStore: 'CheckpointStore',
  CheckpointService: 'CheckpointService',
  MemPalaceService: 'MemPalaceService',
} as const

export default new ContainerModule((bind) => {
  bind(MEMORY_TYPES.SessionStore).to(SessionStore).inSingletonScope()

  // CheckpointStore reads THEIA_APP_PROJECT_PATH (set by electron-main before server starts)
  bind(MEMORY_TYPES.CheckpointStore).toDynamicValue(
    () => new CheckpointStore(process.env.THEIA_APP_PROJECT_PATH ?? process.cwd())
  ).inSingletonScope()

  bind(MEMORY_TYPES.CheckpointService).to(CheckpointService).inSingletonScope()
  bind(MEMORY_TYPES.MemoryService).to(MemoryService).inSingletonScope()
  bind(MEMORY_TYPES.MemoryIsolationService).to(MemoryIsolationService).inSingletonScope()
  bind(MEMORY_TYPES.MemPalaceService).to(MemPalaceService).inSingletonScope()
})
