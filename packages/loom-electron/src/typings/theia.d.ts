// Type stubs for @theia/core node modules
// These are provided by the Theia framework at runtime

declare module '@theia/core/lib/node/backend-application-config-provider' {
  export class BackendApplicationConfigProvider {
    static set(config: { singleInstance?: boolean; [key: string]: unknown }): void
    static get(): { singleInstance?: boolean; [key: string]: unknown }
  }
}

declare module '@theia/core/lib/node' {
  export class BackendApplication {
    constructor(serverModule: unknown)
    start(): Promise<void>
  }

  export interface BackendApplicationContribution {
    onStart?(): void | Promise<void>
    onStop?(): void | Promise<void>
  }
}

declare module '@theia/core/lib/node/messaging/ipc-protocol' {
  const serverModule: unknown
  export = serverModule
}
