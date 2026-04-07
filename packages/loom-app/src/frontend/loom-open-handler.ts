import { injectable, inject } from 'inversify'
import { OpenHandler, OpenerOptions } from '@theia/core/lib/browser/opener-service'
import { WidgetManager, ApplicationShell } from '@theia/core/lib/browser'
import URI from '@theia/core/lib/common/uri'
import { AgentPanelWidget } from '@loom/ui'

export const LOOM_OPEN_HANDLER_ID = 'loom-open-handler'

@injectable()
export class LoomOpenHandler implements OpenHandler {
  readonly id = LOOM_OPEN_HANDLER_ID

  constructor(
    @inject(WidgetManager) private widgetManager: WidgetManager,
    @inject(ApplicationShell) private shell: ApplicationShell
  ) {}

  canHandle(uri: URI, options?: OpenerOptions): number {
    // Handle .loom files and loom:// protocol
    if (uri.scheme === 'loom') {
      return 1000 // Highest priority
    }
    if (uri.path.ext === '.loom') {
      return 500
    }
    return 0
  }

  async open(uri: URI, options?: OpenerOptions): Promise<void> {
    const path = uri.path.toString()

    // Handle different Loom URI types
    if (uri.scheme === 'loom') {
      const type = uri.authority
      switch (type) {
        case 'agent-panel':
          await this.openAgentPanel()
          break
        case 'flow-timeline':
          await this.openFlowTimeline()
          break
        case 'spec':
          await this.openSpecView(uri)
          break
        default:
          console.warn(`[LoomOpenHandler] Unknown Loom URI type: ${type}`)
      }
    } else if (uri.path.ext === '.loom') {
      // Handle .loom configuration/state files
      await this.openLoomFile(uri)
    }
  }

  private async openAgentPanel(): Promise<void> {
    // Widget will be created via WidgetManager
    console.log('[LoomOpenHandler] Opening Agent Panel')
  }

  private async openFlowTimeline(): Promise<void> {
    console.log('[LoomOpenHandler] Opening Flow Timeline')
  }

  private async openSpecView(uri: URI): Promise<void> {
    console.log(`[LoomOpenHandler] Opening Spec: ${uri.path}`)
  }

  private async openLoomFile(uri: URI): Promise<void> {
    console.log(`[LoomOpenHandler] Opening .loom file: ${uri.path}`)
  }
}
