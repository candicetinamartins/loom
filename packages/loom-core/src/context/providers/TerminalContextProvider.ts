import { injectable, inject } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'
import { FlowTrackingService } from '../../services/FlowTrackingService'

@injectable()
export class TerminalContextProvider implements ContextProvider {
  readonly type = 'terminal'
  readonly prefix = 'terminal'

  constructor(
    @inject(FlowTrackingService) private flowService: FlowTrackingService
  ) {}

  async provideContext(_mention: string): Promise<MentionContext> {
    // Get recent terminal output events from FlowTrackingService
    const terminalEvents = this.flowService.getEventsByType('terminal_output', 10)
    
    if (terminalEvents.length === 0) {
      return {
        type: this.type,
        content: 'No recent terminal output captured.',
        tokens: 10,
      }
    }

    // Format terminal output
    const terminalContent = terminalEvents
      .map(e => {
        const output = e.data.output as string || ''
        const command = e.data.command as string || 'unknown'
        return `[${new Date(e.timestamp).toLocaleTimeString()}] $ ${command}\n${output.slice(0, 500)}`
      })
      .join('\n---\n')

    return {
      type: this.type,
      content: `Recent terminal output:\n${terminalContent}`,
      tokens: Math.ceil(terminalContent.length / 4),
    }
  }
}
