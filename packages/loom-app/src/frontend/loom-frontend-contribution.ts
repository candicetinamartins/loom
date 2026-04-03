import { FrontendApplicationContribution } from '@theia/core/lib/browser'
import { injectable } from 'inversify'

@injectable()
export class LoomFrontendContribution implements FrontendApplicationContribution {
  async onStart(): Promise<void> {
    console.log('Loom IDE frontend started')
  }
}
