// Type stubs for @theia/ai-core
// These are provided by the Theia framework at runtime

declare module '@theia/ai-core/lib/common' {
  export interface ToolCallResult {
    result?: string
    content?: string | Array<{ type: string; text?: string }>
    isError?: boolean
  }

  export interface ToolInvocationContext {
    sessionId?: string
    agentId?: string
    [key: string]: unknown
  }

  export interface ToolRequest {
    id: string
    name: string
    description: string
    parameters?: {
      type: string
      properties?: Record<string, { type: string; description?: string; enum?: string[] }>
      required?: string[]
    }
    handler(arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult>
  }

  export interface ToolProvider {
    getTool(): ToolRequest
  }

  export interface Agent {
    readonly id: string
    readonly name: string
    readonly description: string
    readonly variables?: any[]
    readonly prompts?: any[]
    readonly languageModelRequirements?: any[]
    readonly agentSpecificVariables?: any[]
    readonly functions?: any[]
  }
}
