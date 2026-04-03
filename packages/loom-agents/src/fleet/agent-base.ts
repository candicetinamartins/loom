import { Agent } from '@theia/ai-core/lib/common'

export interface LoomAgentConfig {
  name: string
  description: string
  model: string
  thinkingBudget: number
  toolGroups: string[]
  systemPrompt: string
}

export abstract class LoomAgentBase implements Agent {
  abstract readonly id: string
  abstract readonly name: string
  abstract readonly description: string
  abstract readonly model: string
  abstract readonly thinkingBudget: number
  abstract readonly toolGroups: string[]

  // Agent interface properties
  readonly variables: any[] = []
  readonly prompts: any[] = []
  readonly languageModelRequirements: any[] = []
  readonly agentSpecificVariables: any[] = []
  readonly functions: any[] = []

  abstract getSystemPrompt(): string

  async execute(task: string, context?: any): Promise<any> {
    const systemPrompt = this.getSystemPrompt()
    
    return {
      agentName: this.name,
      task,
      systemPrompt,
      model: this.model,
      toolGroups: this.toolGroups,
      thinkingBudget: this.thinkingBudget,
    }
  }
}
