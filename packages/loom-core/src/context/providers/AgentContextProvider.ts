import { MentionContext, ContextProvider } from '../MentionContextProvider'

export class AgentContextProvider implements ContextProvider {
  readonly type = 'agent'
  readonly prefix = 'agent:'

  async provideContext(mention: string): Promise<MentionContext> {
    const agentName = mention.substring(this.prefix.length)

    return {
      type: this.type,
      content: `Agent: ${agentName}\n(Agent reference for multi-agent orchestration)`,
      tokens: 15,
    }
  }
}
