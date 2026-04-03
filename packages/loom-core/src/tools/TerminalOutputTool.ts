export interface TerminalOutputInput {
  sessionId?: string
  lines?: number
}

export interface TerminalOutputOutput {
  sessionId: string
  output: string
  lines: number
}

export class TerminalOutputTool {
  readonly name = 'terminal_output'
  readonly description = 'Get terminal output'

  async execute(input: TerminalOutputInput): Promise<TerminalOutputOutput> {
    // Phase 2: Integrate with Theia TerminalService
    return {
      sessionId: input.sessionId ?? 'default',
      output: '',
      lines: 0,
    }
  }
}
