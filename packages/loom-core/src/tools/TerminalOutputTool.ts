import { injectable, inject, optional } from 'inversify'

export interface TerminalOutputInput {
  sessionId?: string
  lines?: number
}

export interface TerminalOutputOutput {
  sessionId: string
  output: string
  lines: number
}

/**
 * TerminalOutputTool - Captures terminal output
 * 
 * Note: This tool captures terminal output that has been tracked by the
 * FlowTrackingService. For real-time terminal access, the agent should
 * use the terminal directly via the Theia UI.
 */
@injectable()
export class TerminalOutputTool {
  readonly name = 'terminal_output'
  readonly description = 'Get recent terminal output (last 100 lines)'

  constructor(
    @inject('FlowTrackingService') @optional() private flowService?: any,
  ) {}

  async execute(input: TerminalOutputInput): Promise<TerminalOutputOutput> {
    // Terminal output capture requires the FlowTrackingService to be active
    // which tracks terminal output events from the TerminalService
    const maxLines = input.lines ?? 100
    
    // Get terminal output from flow tracking if available
    const terminalEvents = this.flowService?.getRecentEvents?.('terminal_output', maxLines) ?? []
    
    const output = terminalEvents
      .map((e: any) => e.payload?.data || '')
      .join('\n')
      .slice(0, 10000) // Limit to ~10KB

    return {
      sessionId: input.sessionId ?? 'default',
      output,
      lines: terminalEvents.length,
    }
  }
}
