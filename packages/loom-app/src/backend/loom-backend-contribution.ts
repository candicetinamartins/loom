import { BackendApplicationContribution } from '@theia/core/lib/node'
import { injectable } from 'inversify'

@injectable()
export class LoomBackendContribution implements BackendApplicationContribution {
  async onStart(): Promise<void> {
    console.log('Loom IDE backend started')
  }
}
