// @ Mention Context Provider System
// Provides context injection for 14 @ mention types:
// @file: @folder: @symbol: @spec: @web: @git:diff @git:log
// @terminal @problems @graph: @memory @agent: @skill: @checkpoint

export interface MentionContext {
  type: string
  content: string
  tokens: number
}

export interface ContextProvider {
  type: string
  prefix: string
  provideContext(mention: string): Promise<MentionContext>
}
