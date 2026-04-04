import { injectable } from 'inversify'

/**
 * EmbeddingService - Vector embeddings for semantic search
 *
 * Generates FLOAT[1536] embeddings via (in priority order):
 * 1. OpenAI text-embedding-ada-002  (OPENAI_API_KEY env var)
 * 2. SAIA academic cloud            (SAIA_API_KEY env var, OpenAI-compatible)
 * 3. Deterministic pseudo-embedding (dev/CI fallback — no key required)
 */
@injectable()
export class EmbeddingService {
  private readonly embeddingDimension = 1536
  private readonly model = 'text-embedding-ada-002'
  private readonly openAiEndpoint = 'https://api.openai.com/v1/embeddings'
  private readonly saiaEndpoint = 'https://chat-ai.academiccloud.de/v1/embeddings'

  async generateEmbedding(text: string): Promise<number[]> {
    const openAiKey = process.env.OPENAI_API_KEY
    const saiaKey = process.env.SAIA_API_KEY

    if (openAiKey) {
      return this.fetchEmbedding(text, this.openAiEndpoint, openAiKey)
    }
    if (saiaKey) {
      return this.fetchEmbedding(text, this.saiaEndpoint, saiaKey)
    }
    return this.deterministicEmbedding(text)
  }

  private async fetchEmbedding(text: string, endpoint: string, apiKey: string): Promise<number[]> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.model, input: text }),
    })

    if (!response.ok) {
      console.warn(`[EmbeddingService] API error ${response.status} — falling back to deterministic embedding`)
      return this.deterministicEmbedding(text)
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> }
    return data.data[0].embedding
  }

  private deterministicEmbedding(text: string): number[] {
    const hash = this.hashCode(text)
    const embedding: number[] = []
    for (let i = 0; i < this.embeddingDimension; i++) {
      embedding.push(Math.sin(hash + i) * 0.5)
    }
    return embedding
  }
  
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.generateEmbedding(t)))
  }
  
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same dimension')
    }
    
    let dotProduct = 0
    let normA = 0
    let normB = 0
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }
  
  private hashCode(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash
  }
}
