// Loom Electron Main Process Entry Point
// This file bootstraps the Theia backend for the Electron app

import { BackendApplicationConfigProvider } from '@theia/core/lib/node/backend-application-config-provider'

BackendApplicationConfigProvider.set({
  singleInstance: true,
})

async function start(): Promise<void> {
  const { BackendApplication } = await import('@theia/core/lib/node')
  const serverModule = await import('@theia/core/lib/node/messaging/ipc-protocol')

  const application = new BackendApplication(serverModule as any, undefined as any)
  await application.start()
}

start().catch(console.error)
