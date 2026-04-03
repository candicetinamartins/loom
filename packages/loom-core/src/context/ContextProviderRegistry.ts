import { MentionContext, ContextProvider } from '../MentionContextProvider'

export class ContextProviderRegistry {
  private providers: Map<string, ContextProvider> = new Map()

  registerProvider(provider: ContextProvider): void {
    this.providers.set(provider.type, provider)
  }

  getProvider(type: string): ContextProvider | undefined {
    return this.providers.get(type)
  }

  async resolveMention(mention: string): Promise<MentionContext | null> {
    // Find matching provider by prefix
    for (const provider of this.providers.values()) {
      if (mention.startsWith(provider.prefix)) {
        return provider.provideContext(mention)
      }
    }
    return null
  }

  async resolveAllMentions(mentions: string[]): Promise<MentionContext[]> {
    const results: MentionContext[] = []
    for (const mention of mentions) {
      const context = await this.resolveMention(mention)
      if (context) {
        results.push(context)
      }
    }
    return results
  }

  extractMentions(text: string): string[] {
    const mentions: string[] = []
    const regex = /@(\w+:[^\s]+|git:diff|git:log|terminal|problems|memory)/g
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      mentions.push(match[1])
    }
    return mentions
  }
}
