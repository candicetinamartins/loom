import { injectable } from 'inversify'

export interface RateLimitConfig {
  requestsPerMinute: number
  tokensPerMinute: number
  burstSize: number
}

export interface TokenBucket {
  tokens: number
  lastRefill: number
}

/**
 * RateLimitManager — Token bucket rate limiting for LLM providers
 * 
 * Features:
 * - Per-provider rate limiting
 * - Token bucket algorithm
 * - Request queuing with backoff
 */
@injectable()
export class RateLimitManager {
  private buckets: Map<string, TokenBucket> = new Map()
  private configs: Map<string, RateLimitConfig> = new Map()
  private queues: Map<string, Array<() => void>> = new Map()

  /**
   * Configure rate limits for a provider
   */
  setConfig(provider: string, config: RateLimitConfig): void {
    this.configs.set(provider, config)
    
    if (!this.buckets.has(provider)) {
      this.buckets.set(provider, {
        tokens: config.burstSize,
        lastRefill: Date.now(),
      })
    }
  }

  /**
   * Check if a request can be made
   */
  canMakeRequest(provider: string, tokenCost: number = 1): boolean {
    const config = this.configs.get(provider)
    if (!config) return true // No limit configured

    const bucket = this.getBucket(provider, config)
    return bucket.tokens >= tokenCost
  }

  /**
   * Acquire tokens for a request (blocking)
   */
  async acquireTokens(provider: string, tokenCost: number = 1): Promise<void> {
    const config = this.configs.get(provider)
    if (!config) return // No limit configured

    while (!this.canMakeRequest(provider, tokenCost)) {
      await this.waitForRefill(provider, config)
    }

    const bucket = this.getBucket(provider, config)
    bucket.tokens -= tokenCost
  }

  /**
   * Acquire with timeout
   */
  async tryAcquireTokens(
    provider: string,
    tokenCost: number = 1,
    timeoutMs: number = 30000
  ): Promise<boolean> {
    const start = Date.now()
    
    while (!this.canMakeRequest(provider, tokenCost)) {
      if (Date.now() - start > timeoutMs) {
        return false
      }
      await this.waitForRefill(provider, this.configs.get(provider)!)
    }

    const bucket = this.getBucket(provider, this.configs.get(provider)!)
    bucket.tokens -= tokenCost
    return true
  }

  /**
   * Record actual token usage for adaptive limiting
   */
  recordUsage(provider: string, tokensUsed: number): void {
    // Could implement adaptive rate limiting here
    // based on observed token usage patterns
    console.log(`[RateLimitManager] ${provider} used ${tokensUsed} tokens`)
  }

  /**
   * Get current bucket state
   */
  getBucketState(provider: string): { tokens: number; maxTokens: number } | null {
    const config = this.configs.get(provider)
    if (!config) return null

    const bucket = this.getBucket(provider, config)
    return {
      tokens: Math.floor(bucket.tokens),
      maxTokens: config.burstSize,
    }
  }

  private getBucket(provider: string, config: RateLimitConfig): TokenBucket {
    let bucket = this.buckets.get(provider)
    
    if (!bucket) {
      bucket = {
        tokens: config.burstSize,
        lastRefill: Date.now(),
      }
      this.buckets.set(provider, bucket)
    }

    // Refill tokens based on time elapsed
    const now = Date.now()
    const elapsedMs = now - bucket.lastRefill
    const refillRate = config.requestsPerMinute / 60000 // tokens per ms
    const tokensToAdd = elapsedMs * refillRate

    bucket.tokens = Math.min(config.burstSize, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now

    return bucket
  }

  private async waitForRefill(provider: string, config: RateLimitConfig): Promise<void> {
    const bucket = this.getBucket(provider, config)
    const tokensNeeded = 1 // minimum
    const refillRate = config.requestsPerMinute / 60000
    const msToWait = Math.ceil(tokensNeeded / refillRate)
    
    await new Promise(resolve => setTimeout(resolve, Math.min(msToWait, 1000)))
  }
}
