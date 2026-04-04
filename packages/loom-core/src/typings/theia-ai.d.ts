// Type stubs for @theia/ai-core and @theia/ai-chat
// These packages are provided by the Theia framework at runtime

declare module '@theia/ai-core/lib/browser/agent-service' {
  import { injectable } from 'inversify'

  export interface Agent {
    id: string
    name: string
    description?: string
  }

  @injectable()
  export class AgentService {
    getAgents(): Agent[]
    getAgent(id: string): Agent | undefined
  }
}

declare module '@theia/ai-chat/lib/browser/chat-agent-service' {
  import { injectable } from 'inversify'

  @injectable()
  export class ChatAgentService {
    sendMessage(agentId: string, message: string): Promise<string>
  }
}
