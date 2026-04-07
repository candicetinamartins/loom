import { injectable, inject, optional } from 'inversify'
import { SecretService } from './SecretService'

/**
 * SAIAProvider — native Loom integration for the GWDG Academic Cloud LLM service.
 *
 * SAIA (Scientific AI Assistant / Scalable AI Accelerator) is an OpenAI-compatible
 * API hosted by GWDG for the European academic community.
 *
 * Docs:  https://docs.hpc.gwdg.de/services/saia/index.html
 * Base:  https://chat-ai.academiccloud.de/v1
 * Auth:  Authorization: Bearer <KISSKI_API_KEY>
 * Key:   Request at https://academiccloud.de/services/chatai/
 *
 * API key resolution order:
 *   1. SAIA_API_KEY environment variable
 *   2. System keychain via keytar (set via Loom SAIA settings)
 *   3. null — SAIA features disabled
 */

export const SAIA_BASE_URL = 'https://chat-ai.academiccloud.de/v1'
export const SAIA_SECRET_KEY = 'saia-api-key'

/** Known SAIA models (used as fallback when /v1/models is unreachable) */
export const SAIA_KNOWN_MODELS: SaiaModelInfo[] = [
  { id: 'meta-llama-3.1-8b-instruct',  name: 'Meta LLaMA 3.1 8B',     hosted: 'internal' },
  { id: 'meta-llama-3.1-70b-instruct', name: 'Meta LLaMA 3.1 70B',    hosted: 'internal' },
  { id: 'meta-llama-3.3-70b-instruct', name: 'Meta LLaMA 3.3 70B',    hosted: 'internal' },
  { id: 'mistral-nemo-instruct',        name: 'Mistral NeMo',           hosted: 'internal' },
  { id: 'qwen2.5-72b-instruct',         name: 'Qwen 2.5 72B',          hosted: 'internal' },
  { id: 'mixtral-8x7b-instruct',        name: 'Mixtral 8×7B',          hosted: 'internal' },
  { id: 'gpt-4o',                       name: 'GPT-4o (via SAIA)',      hosted: 'external' },
  { id: 'gpt-4o-mini',                  name: 'GPT-4o Mini (via SAIA)', hosted: 'external' },
]

export interface SaiaModelInfo {
  id: string
  name: string
  hosted: 'internal' | 'external'
}

export interface SaiaStatus {
  configured: boolean
  keySource: 'env' | 'keychain' | 'none'
  modelsCount: number
}

export interface SaiaChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface SaiaChatOptions {
  model?: string
  messages: SaiaChatMessage[]
  max_tokens?: number
  temperature?: number
  top_p?: number
  frequency_penalty?: number
  seed?: number
  stream?: boolean
}

export interface SaiaChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

export interface SaiaRateLimits {
  limit: number
  remaining: number
  resetAt: number   // unix ms
}

@injectable()
export class SAIAProvider {
  private readonly baseUrl = SAIA_BASE_URL
  private _modelCache: SaiaModelInfo[] | null = null
  private _modelCacheAt = 0
  private static readonly MODEL_CACHE_TTL = 60 * 60 * 1000 // 1 hour

  constructor(
    @inject(SecretService) @optional() private secretService: SecretService,
  ) {}

  // ── API key resolution ─────────────────────────────────────────────────────

  async getApiKey(): Promise<string | null> {
    // 1. Environment variable — works out of the box for CI, server deployments, .env
    if (process.env.SAIA_API_KEY) return process.env.SAIA_API_KEY.trim()
    // 2. System keychain via keytar (set via Loom SAIA settings widget)
    if (this.secretService) {
      try {
        const key = await this.secretService.get(SAIA_SECRET_KEY)
        if (key) return key.trim()
      } catch { /* keytar unavailable in some sandboxed envs */ }
    }
    return null
  }

  async setApiKey(key: string): Promise<void> {
    if (!this.secretService) throw new Error('SecretService unavailable — set SAIA_API_KEY env var instead')
    await this.secretService.setSecret(SAIA_SECRET_KEY, key.trim())
    // Clear model cache so next listModels() uses the new key
    this._modelCache = null
    this._modelCacheAt = 0
  }

  async deleteApiKey(): Promise<void> {
    if (this.secretService) {
      try { await this.secretService.deleteSecret(SAIA_SECRET_KEY) } catch { /* ok */ }
    }
    this._modelCache = null
  }

  async getStatus(): Promise<SaiaStatus> {
    const envKey = process.env.SAIA_API_KEY
    let keychainKey: string | null = null
    if (this.secretService) {
      try { keychainKey = await this.secretService.get(SAIA_SECRET_KEY) } catch { /* ok */ }
    }
    const configured = !!(envKey || keychainKey)
    const keySource: SaiaStatus['keySource'] = envKey ? 'env' : keychainKey ? 'keychain' : 'none'
    const models = this._modelCache ?? SAIA_KNOWN_MODELS
    return { configured, keySource, modelsCount: models.length }
  }

  // ── Models ─────────────────────────────────────────────────────────────────

  /**
   * Fetch available models from SAIA's /v1/models endpoint.
   * Caches the response for 1 hour. Falls back to SAIA_KNOWN_MODELS on error.
   */
  async listModels(forceRefresh = false): Promise<SaiaModelInfo[]> {
    const now = Date.now()
    if (!forceRefresh && this._modelCache && (now - this._modelCacheAt) < SAIAProvider.MODEL_CACHE_TTL) {
      return this._modelCache
    }

    const apiKey = await this.getApiKey()
    if (!apiKey) return SAIA_KNOWN_MODELS

    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const data = await res.json() as { data: Array<{ id: string; owned_by?: string }> }
      // Map to our internal format; mark as 'external' if owned by openai
      this._modelCache = (data.data ?? []).map(m => ({
        id: m.id,
        name: this._labelFor(m.id),
        hosted: (m.owned_by === 'openai' ? 'external' : 'internal') as 'internal' | 'external',
      }))
      this._modelCacheAt = now
      console.log(`[SAIAProvider] Fetched ${this._modelCache.length} models from SAIA`)
      return this._modelCache
    } catch (e) {
      console.warn('[SAIAProvider] Could not fetch model list, using known models:', e)
      return SAIA_KNOWN_MODELS
    }
  }

  // ── Chat completion ─────────────────────────────────────────────────────────

  async chatCompletion(options: SaiaChatOptions): Promise<SaiaChatResponse> {
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new Error('SAIA API key not configured. Set SAIA_API_KEY env var or configure in Loom settings.')

    const model = options.model ?? 'meta-llama-3.1-8b-instruct'
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p,
        frequency_penalty: options.frequency_penalty,
        seed: options.seed,
        stream: false,
      }),
    })

    this._parseRateLimits(res.headers)

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SAIA error ${res.status}: ${text}`)
    }
    return res.json() as Promise<SaiaChatResponse>
  }

  /**
   * Streaming chat completion — returns the raw Response body (SSE stream).
   * Callers pipe this to the client or consume it with an async iterator.
   */
  async chatCompletionStream(options: SaiaChatOptions): Promise<ReadableStream<Uint8Array>> {
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new Error('SAIA API key not configured.')

    const model = options.model ?? 'meta-llama-3.1-8b-instruct'
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model,
        messages: options.messages,
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        stream: true,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`SAIA stream error ${res.status}: ${text}`)
    }
    if (!res.body) throw new Error('SAIA: no response body')
    return res.body
  }

  // ── Embeddings ─────────────────────────────────────────────────────────────

  async embeddings(input: string | string[], model = 'multilingual-e5-large-instruct'): Promise<number[][]> {
    const apiKey = await this.getApiKey()
    if (!apiKey) throw new Error('SAIA API key not configured.')

    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, input }),
    })
    if (!res.ok) throw new Error(`SAIA embeddings error ${res.status}`)
    const data = await res.json() as { data: Array<{ embedding: number[] }> }
    return data.data.map(d => d.embedding)
  }

  // ── Rate limits ────────────────────────────────────────────────────────────

  private _lastRateLimits: SaiaRateLimits | null = null

  getRateLimits(): SaiaRateLimits | null {
    return this._lastRateLimits
  }

  private _parseRateLimits(headers: Headers): void {
    const limit = parseInt(headers.get('X-RateLimit-Limit') ?? '0', 10)
    const remaining = parseInt(headers.get('X-RateLimit-Remaining') ?? '0', 10)
    const reset = parseInt(headers.get('X-RateLimit-Reset') ?? '0', 10)
    if (limit) {
      this._lastRateLimits = { limit, remaining, resetAt: reset * 1000 }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _labelFor(id: string): string {
    const known = SAIA_KNOWN_MODELS.find(m => m.id === id)
    if (known) return known.name
    // Prettify e.g. "meta-llama-3.1-8b-instruct" → "Meta Llama 3.1 8B Instruct"
    return id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }
}
