declare module 'inversify' {
  export interface ContainerModule {
    registry: any
  }
  export class ContainerModule {
    constructor(registry: (bind: any, unbind: any, isBound: any, rebind: any) => void)
  }

  export function inject(serviceIdentifier: any): any
  export function injectable(): any
  export function optional(): any

  export interface Container {
    bind<T>(serviceIdentifier: any): any
  }
}
