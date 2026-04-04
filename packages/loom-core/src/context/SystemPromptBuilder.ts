import { injectable, inject } from 'inversify'
import { FlowTrackingService, FlowContext } from '../services/FlowTrackingService'

export interface SystemPromptSection {
  name: string
  content: string
  priority: number
  tokenBudget: number
}

export interface SystemPrompt {
  sections: SystemPromptSection[]
  totalTokens: number
}

@injectable()
export class SystemPromptBuilder {
  private sections: Map<string, SystemPromptSection> = new Map()

  constructor(
    @inject(FlowTrackingService) private flowService: FlowTrackingService
  ) {}

  buildPrompt(userContext?: string): SystemPrompt {
    // Clear previous sections
    this.sections.clear()

    // Add base agent identity
    this.addSection({
      name: 'identity',
      content: this.getAgentIdentity(),
      priority: 100,
      tokenBudget: 200,
    })

    // Add flow context (dynamic based on current flow)
    const flowContext = this.flowService.getCurrentContext()
    if (flowContext) {
      this.addSection({
        name: 'flow',
        content: this.formatFlowContext(flowContext),
        priority: 90,
        tokenBudget: 150,
      })
    }

    // Add available tools reference
    this.addSection({
      name: 'tools',
      content: this.getToolsReference(),
      priority: 80,
      tokenBudget: 300,
    })

    // Add @ mention providers reference
    this.addSection({
      name: 'context_providers',
      content: this.getContextProvidersReference(),
      priority: 70,
      tokenBudget: 200,
    })

    // Add user-specific context if provided
    if (userContext) {
      this.addSection({
        name: 'user_context',
        content: userContext,
        priority: 60,
        tokenBudget: 500,
      })
    }

    // Compile sections by priority
    const compiled = this.compilePrompt()

    return {
      sections: compiled,
      totalTokens: this.estimateTokens(compiled),
    }
  }

  private addSection(section: SystemPromptSection): void {
    this.sections.set(section.name, section)
  }

  private compilePrompt(): SystemPromptSection[] {
    return Array.from(this.sections.values())
      .sort((a, b) => b.priority - a.priority)
  }

  private formatFlowContext(context: FlowContext): string {
    return `Current Flow State:
Intent: ${context.intent} (${Math.round(context.confidence * 100)}% confidence)
Recent Events:
${context.recentEvents.map(e => `- ${e.type}: ${e.data?.description || e.filePath || 'No details'}`).join('\n')}
Active File: ${context.activeFile || 'None'}
Terminal Active: ${context.terminalActive ? 'Yes' : 'No'}
Recent Diagnostics: ${context.recentDiagnostics?.length || 0} issues`
  }

  private getAgentIdentity(): string {
    return `You are Loom, an AI IDE assistant with access to:
- 12 specialized agents (orchestrator, engineer, architect, reviewer, etc.)
- File operations, git, terminal, web search tools
- @ mentions for context injection (@file, @git, @terminal, etc.)
- Flow awareness tracking user activity

Operating Modes:
- CODE: Directly write and modify code
- ASK: Provide suggestions without modifying code

Always use tools when available rather than describing actions.`
  }

  private getToolsReference(): string {
    return `Available Tools:
File: file_read, file_write, file_edit, directory_list, search_files
Git: git_status, git_diff, git_log, git_branch
Terminal: shell_exec (read-only), terminal_capture
Web: web_search, web_fetch
Context: @file:path, @git:diff, @terminal, @problems, @history`
  }

  private getContextProvidersReference(): string {
    return `Context Providers (@ mentions):
@file:path/to/file - Inject file contents
@git:diff - Current git changes
@git:log - Recent commit history
@terminal - Current terminal output
@problems - Active diagnostics/errors
@docs:package - Package documentation
@history - Recent conversation history
@web:url - Web page content`
  }

  private estimateTokens(sections: SystemPromptSection[]): number {
    // Rough estimation: ~4 chars per token
    const totalChars = sections.reduce((sum, s) => sum + s.content.length, 0)
    return Math.ceil(totalChars / 4)
  }

  // For Theia AI integration - builds final prompt string
  buildPromptString(userContext?: string): string {
    const prompt = this.buildPrompt(userContext)
    return prompt.sections
      .map(s => `=== ${s.name} ===\n${s.content}`)
      .join('\n\n')
  }
}
