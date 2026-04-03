import { ContainerModule } from 'inversify'

export default new ContainerModule((_bind) => {
  // UI components are Lumino widgets that don't require DI binding
  // They are instantiated directly by the consuming application
})

export function initializeLoomUI(): void {
  // Initialize any UI-related services here
}
