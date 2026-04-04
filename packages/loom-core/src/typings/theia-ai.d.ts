// Type stubs for @theia/ai-core and @theia/ai-chat
// These packages are provided by the Theia framework at runtime

declare module '@theia/ai-core/lib/browser/agent-service' {
  export interface Agent {
    id: string
    name: string
    description?: string
  }

  export class AgentService {
    getAgents(): Agent[]
    getAgent(id: string): Agent | undefined
  }
}

declare module '@theia/ai-chat/lib/browser/chat-agent-service' {
  export class ChatAgentService {
    sendMessage(agentId: string, message: string): Promise<string>
    resolveAgent(...args: any[]): Promise<unknown>
  }
}

declare module '@theia/ai-chat/lib/common/chat-agent-service' {
  export class ChatAgentService {
    sendMessage(agentId: string, message: string): Promise<string>
    resolveAgent(...args: any[]): Promise<unknown>
  }
}

declare module '@theia/ai-chat/lib/common/chat-model' {
  export interface ChatRequest {
    messages?: Array<{ role?: string; content?: string }>
    metadata?: Record<string, any>
    [key: string]: any
  }

  export interface ParsedChatRequest extends ChatRequest {
    text: string
  }
}
