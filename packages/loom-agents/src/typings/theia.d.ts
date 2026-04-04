// Type stubs for @theia/ai-core
// These are provided by the Theia framework at runtime

declare module '@theia/ai-core/lib/common' {
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
