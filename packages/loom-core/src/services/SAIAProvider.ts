import { injectable, inject } from 'inversify'
import { SecretService } from './SecretService'

/**
 * SAIA LLM Provider Configuration
 * 
 * SAIA (Scalable Artificial Intelligence Accelerator) - GWDG Academic Cloud
 * OpenAI-compatible API endpoint for LLM inference
 * 
 * Base URL: https://chat-ai.academiccloud.de/v1
 * Authentication: Bearer token via API key
 * 
 * Available models via /v1/models endpoint:
 * - meta-llama-3.1-8b-instruct
 * - mistral-nemo-instruct
 * - And more (check /v1/models for current list)
 */

export interface SAIAConfig {
  baseUrl: string
  apiKey: string
  defaultModel: string
}

export interface SAIAModelInfo {
  id: string
  object: string
  created: number
  owned_by: string
}

export interface SAIAModelsResponse {
  object: string
  data: SAIAModelInfo[]
}

@injectable()
export class SAIAProvider {
  private baseUrl = 'https://chat-ai.academiccloud.de/v1'

  constructor(
    @inject(SecretService) private secretService: SecretService,
  ) {}

  /**
   * Get SAIA configuration
   */
  async getConfig(): Promise<SAIAConfig> {
    const apiKey = await this.secretService.get('saia-api-key')
    
    return {
      baseUrl: this.baseUrl,
      apiKey: apiKey || '',
      defaultModel: 'meta-llama-3.1-8b-instruct',
    }
  }

  /**
   * List available models from SAIA
   */
  async listModels(apiKey: string): Promise<SAIAModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`SAIA API error: ${response.status} ${response.statusText}`)
    }

    const data: SAIAModelsResponse = await response.json()
    return data.data
  }

  /**
   * Create chat completion request
   */
  async chatCompletion(
    apiKey: string,
    options: {
      model?: string
      messages: Array<{ role: string; content: string }>
      max_tokens?: number
      temperature?: number
      top_p?: number
      frequency_penalty?: number
      seed?: number
    }
  ): Promise<any> {
    const model = options.model || 'meta-llama-3.1-8b-instruct'
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        seed: options.seed,
      }),
    })

    if (!response.ok) {
      throw new Error(`SAIA API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Create embeddings request
   */
  async embeddings(
    apiKey: string,
    options: {
      model?: string
      input: string | string[]
    }
  ): Promise<any> {
    const model = options.model || 'embeddings-model' // Use appropriate SAIA embedding model
    
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: options.input,
      }),
    })

    if (!response.ok) {
      throw new Error(`SAIA API error: ${response.status} ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Get API limits from response headers
   * X-RateLimit-Limit: Maximum requests per minute
   * X-RateLimit-Remaining: Remaining requests
   * X-RateLimit-Reset: Unix timestamp when limit resets
   */
  parseRateLimits(headers: Headers): {
    limit: number
    remaining: number
    reset: number
  } {
    return {
      limit: parseInt(headers.get('X-RateLimit-Limit') || '0'),
      remaining: parseInt(headers.get('X-RateLimit-Remaining') || '0'),
      reset: parseInt(headers.get('X-RateLimit-Reset') || '0'),
    }
  }
}
