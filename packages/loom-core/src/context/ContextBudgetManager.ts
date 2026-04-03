import { ToolGroupRegistry, ToolGroupName } from '../tools/ToolGroupRegistry'

export const MODEL_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-6': 200_000,
  'claude-sonnet-4-5': 200_000,
  'claude-haiku-4-5': 200_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,
}

export interface AgentBudget {
  agentName: string
  model: string
  maxTokens: number
  reservedTokens: number
  availableTokens: number
  toolGroups: ToolGroupName[]
}

export class ContextBudgetManager {
  private budgets: Map<string, AgentBudget> = new Map()

  constructor(private toolRegistry: ToolGroupRegistry) {}

  allocateBudget(
    agentName: string,
    model: string,
    toolGroups: ToolGroupName[],
    reservePercentage: number = 0.3,
  ): AgentBudget {
    const maxTokens = MODEL_CONTEXT_WINDOWS[model] ?? 200_000
    const reservedTokens = Math.floor(maxTokens * reservePercentage)
    const availableTokens = maxTokens - reservedTokens

    const budget: AgentBudget = {
      agentName,
      model,
      maxTokens,
      reservedTokens,
      availableTokens,
      toolGroups,
    }

    this.budgets.set(agentName, budget)
    return budget
  }

  getBudget(agentName: string): AgentBudget | undefined {
    return this.budgets.get(agentName)
  }

  estimateToolUsage(toolGroups: ToolGroupName[]): number {
    return this.toolRegistry.estimateTokens(toolGroups)
  }

  canAfford(agentName: string, additionalTokens: number): boolean {
    const budget = this.getBudget(agentName)
    if (!budget) return false

    return budget.availableTokens >= additionalTokens
  }

  deductTokens(agentName: string, tokens: number): void {
    const budget = this.budgets.get(agentName)
    if (budget) {
      budget.availableTokens = Math.max(0, budget.availableTokens - tokens)
    }
  }

  resetBudget(agentName: string): void {
    const budget = this.budgets.get(agentName)
    if (budget) {
      budget.availableTokens = budget.maxTokens - budget.reservedTokens
    }
  }

  getAllBudgets(): AgentBudget[] {
    return Array.from(this.budgets.values())
  }
}
