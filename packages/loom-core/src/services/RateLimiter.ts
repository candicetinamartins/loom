export interface TokenBucket {
  tokens: number
  lastRefill: number
  capacity: number
  refillRate: number // tokens per second
}

export class RateLimiter {
  private buckets: Map<string, TokenBucket> = new Map()
  private defaultCapacity = 100
  private defaultRefillRate = 10 // 10 tokens per second

  getBucket(provider: string): TokenBucket {
    if (!this.buckets.has(provider)) {
      this.buckets.set(provider, {
        tokens: this.defaultCapacity,
        lastRefill: Date.now(),
        capacity: this.defaultCapacity,
        refillRate: this.defaultRefillRate,
      })
    }
    return this.buckets.get(provider)!
  }

  configureBucket(provider: string, capacity: number, refillRate: number): void {
    const existing = this.buckets.get(provider)
    this.buckets.set(provider, {
      tokens: existing?.tokens ?? capacity,
      lastRefill: existing?.lastRefill ?? Date.now(),
      capacity,
      refillRate,
    })
  }

  refill(bucket: TokenBucket): void {
    const now = Date.now()
    const elapsedMs = now - bucket.lastRefill
    const tokensToAdd = (elapsedMs / 1000) * bucket.refillRate
    bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now
  }

  async acquireToken(provider: string): Promise<boolean> {
    const bucket = this.getBucket(provider)
    this.refill(bucket)

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }

    // Wait for token to be available
    const waitMs = (1 / bucket.refillRate) * 1000
    await new Promise(resolve => setTimeout(resolve, waitMs))
    return this.acquireToken(provider)
  }

  getAvailableTokens(provider: string): number {
    const bucket = this.getBucket(provider)
    this.refill(bucket)
    return Math.floor(bucket.tokens)
  }

  async checkLimit(provider: string): Promise<boolean> {
    const bucket = this.getBucket(provider)
    this.refill(bucket)
    return bucket.tokens >= 1
  }

  recordUsage(provider: string, tokens: number = 1): void {
    const bucket = this.getBucket(provider)
    this.refill(bucket)
    bucket.tokens = Math.max(0, bucket.tokens - tokens)
  }
}
