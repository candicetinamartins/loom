import { ContainerModule } from 'inversify'
import { HookService } from './HookService'

export const HOOK_TYPES = {
  HookService: 'HookService',
} as const

export default new ContainerModule((bind) => {
  bind(HOOK_TYPES.HookService).to(HookService).inSingletonScope()
})
