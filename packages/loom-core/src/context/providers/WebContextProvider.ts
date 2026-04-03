import { MentionContext, ContextProvider } from '../MentionContextProvider'

export class WebContextProvider implements ContextProvider {
  readonly type = 'web'
  readonly prefix = 'web:'

  async provideContext(mention: string): Promise<MentionContext> {
    const url = mention.substring(this.prefix.length)

    // Phase 1: Uses WebFetchTool
    return {
      type: this.type,
      content: `Web URL: ${url}\n(Use web_fetch tool to retrieve content)`,
      tokens: 20,
    }
  }
}
