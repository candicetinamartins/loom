import { injectable, inject } from 'inversify'
import Anthropic from '@anthropic-ai/sdk'
import { OpenAI } from 'openai'

export type Provider = 'anthropic' | 'openai' | 'ollama'

export interface ProviderConfig {
  provider: Provider
  apiKey?: string
  baseUrl?: string
  model: string
  thinkingBudget?: number
}

export interface RouteRequest {
  messages: Array<{ role: string; content: string }>
  config: ProviderConfig
  tools?: any[]
  stream?: boolean
}

export interface RouteResponse {
  content: string
  toolCalls?: any[]
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  model: string
  provider: Provider
}

/**
 * ProviderRouter — Route LLM requests to Anthropic, OpenAI, or Ollama
 * 
 * Features:
 * - Unified interface for multiple providers
 * - Automatic fallback
 * - Token usage tracking
 */
@injectable()
export class ProviderRouter {
  private anthropicClient: Anthropic | null = null
  private openaiClient: OpenAI | null = null

  constructor(
    @inject('ANTHROPIC_API_KEY') private anthropicKey?: string,
    @inject('OPENAI_API_KEY') private openaiKey?: string,
    @inject('OLLAMA_BASE_URL') private ollamaUrl: string = 'http://localhost:11434'
  ) {}

  async initialize(): Promise<void> {
    if (this.anthropicKey) {
      this.anthropicClient = new Anthropic({ apiKey: this.anthropicKey })
    }
    if (this.openaiKey) {
      this.openaiClient = new OpenAI({ apiKey: this.openaiKey })
    }
  }

  /**
   * Route a request to the appropriate provider
   */
  async route(request: RouteRequest): Promise<RouteResponse> {
    switch (request.config.provider) {
      case 'anthropic':
        return this.routeToAnthropic(request)
      case 'openai':
        return this.routeToOpenAI(request)
      case 'ollama':
        return this.routeToOllama(request)
      default:
        throw new Error(`Unknown provider: ${request.config.provider}`)
    }
  }

  private async routeToAnthropic(request: RouteRequest): Promise<RouteResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized')
    }

    const response = await this.anthropicClient.messages.create({
      model: request.config.model,
      max_tokens: 4096,
      messages: request.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      ...(request.tools && { tools: request.tools }),
    })

    const content = response.content
      .filter(c => c.type === 'text')
      .map(c => (c as any).text)
      .join('')

    const toolCalls = response.content
      .filter(c => c.type === 'tool_use')
      .map(c => c as any)

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
      },
      model: response.model,
      provider: 'anthropic',
    }
  }

  private async routeToOpenAI(request: RouteRequest): Promise<RouteResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized')
    }

    const response = await this.openaiClient.chat.completions.create({
      model: request.config.model,
      messages: request.messages as any,
      ...(request.tools && { tools: request.tools }),
      stream: false,
    })

    const choice = response.choices[0]

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls,
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      provider: 'openai',
    }
  }

  private async routeToOllama(request: RouteRequest): Promise<RouteResponse> {
    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: request.config.model,
        messages: request.messages,
        stream: false,
      }),
    })

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`)
    }

    const data = await response.json() as {
      message?: { content?: string }
      prompt_eval_count?: number
      eval_count?: number
    }

    return {
      content: data.message?.content || '',
      usage: {
        inputTokens: data.prompt_eval_count || 0,
        outputTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model: request.config.model,
      provider: 'ollama',
    }
  }

  /**
   * Check if a provider is available
   */
  isProviderAvailable(provider: Provider): boolean {
    switch (provider) {
      case 'anthropic':
        return this.anthropicClient !== null
      case 'openai':
        return this.openaiClient !== null
      case 'ollama':
        return true // Always attempt Ollama, will fail at request time if not running
      default:
        return false
    }
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): Provider[] {
    const available: Provider[] = []
    if (this.anthropicClient) available.push('anthropic')
    if (this.openaiClient) available.push('openai')
    available.push('ollama') // Always include, runtime check
    return available
  }
}
