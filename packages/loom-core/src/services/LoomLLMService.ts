import { injectable, inject } from 'inversify'
import { AgentService } from '@theia/ai-core/lib/browser/agent-service'
import { ChatAgentService } from '@theia/ai-chat/lib/browser/chat-agent-service'
import { ToolProvider } from '../tools/ToolProvider'
import { SystemPromptBuilder } from '../context/SystemPromptBuilder'
import { RateLimiter } from '../services/RateLimiter'

export interface LLMRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: string[]
}

export interface LLMResponse {
  content: string
  toolCalls?: Array<{
    tool: string
    arguments: Record<string, unknown>
  }>
  tokenUsage: {
    input: number
    output: number
    total: number
  }
  model: string
}

/**
 * Loom LLM Service - Wraps Theia AI for Loom-specific needs
 * 
 * Responsibilities:
 * - System prompt building with flow context
 * - Rate limiting before requests
 * - Tool registration and execution
 * - Response formatting
 */
@injectable()
export class LoomLLMService {
  constructor(
    @inject(AgentService) private agentService: AgentService,
    @inject(ChatAgentService) private chatAgentService: ChatAgentService,
    @inject(ToolProvider) private toolProvider: ToolProvider,
    @inject(SystemPromptBuilder) private promptBuilder: SystemPromptBuilder,
    @inject(RateLimiter) private rateLimiter: RateLimiter
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    // Check rate limits
    const canProceed = await this.rateLimiter.checkLimit(
      request.model || 'default'
    )
    if (!canProceed) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.')
    }

    // Build system prompt with flow context
    const systemPrompt = this.promptBuilder.buildPromptString()
    
    // Prepare messages with system prompt
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...request.messages
    ]

    // Get available tools
    const tools = request.tools 
      ? this.toolProvider.getTools(request.tools)
      : []

    // Call Theia AI
    const response = await this.callTheiaAI({
      messages,
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }))
    })

    // Execute any tool calls
    if (response.toolCalls) {
      for (const toolCall of response.toolCalls) {
        const tool = this.toolProvider.getTool(toolCall.tool)
        if (tool && tool.execute) {
          const result = await tool.execute(toolCall.arguments)
          // Add tool result to context for follow-up
          messages.push({
            role: 'assistant' as const,
            content: `Tool ${toolCall.tool} result: ${JSON.stringify(result)}`
          })
        }
      }
    }

    // Record usage for rate limiting
    await this.rateLimiter.recordUsage(
      request.model || 'default',
      response.tokenUsage.total
    )

    return response
  }

  async stream(
    request: LLMRequest,
    onChunk: (chunk: string) => void
  ): Promise<LLMResponse> {
    const canProceed = await this.rateLimiter.checkLimit(
      request.model || 'default'
    )
    if (!canProceed) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.')
    }

    const systemPrompt = this.promptBuilder.buildPromptString()
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...request.messages
    ]

    // Streaming implementation would use Theia AI's streaming API
    // For now, delegate to complete
    const response = await this.complete(request)
    onChunk(response.content)
    return response
  }

  private async callTheiaAI(request: {
    messages: Array<{ role: string; content: string }>
    model?: string
    temperature?: number
    maxTokens?: number
    tools?: Array<{
      name: string
      description: string
      parameters: unknown
    }>
  }): Promise<LLMResponse> {
    const agentId = request.model || 'claude-sonnet-4-5'

    // Combine messages into a single prompt string for ChatAgentService
    const prompt = request.messages
      .filter(m => m.role !== 'system')
      .map(m => m.content)
      .join('\n')

    const responseText = await this.chatAgentService.sendMessage(agentId, prompt)

    // Estimate token usage from character counts (~4 chars per token)
    const inputChars = request.messages.reduce((sum, m) => sum + m.content.length, 0)
    const inputTokens = Math.ceil(inputChars / 4)
    const outputTokens = Math.ceil((responseText as string).length / 4)

    return {
      content: responseText as string,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      model: agentId,
    }
  }

  /**
   * Get available agents from Theia AI
   */
  getAgents(): string[] {
    return this.agentService.getAgents().map(a => a.id)
  }

  /**
   * Invoke a specific agent
   */
  async invokeAgent(agentId: string, prompt: string): Promise<LLMResponse> {
    return this.complete({
      messages: [{ role: 'user', content: prompt }],
      model: agentId
    })
  }
}
