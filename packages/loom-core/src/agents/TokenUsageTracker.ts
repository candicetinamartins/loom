export interface TokenUsage {
  input: number
  output: number
  total: number
}

export interface TurnMetrics {
  turnNumber: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  protocolViolations: number
  hasNarration: boolean
}

export interface AgentMetrics {
  agentName: string
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalTurns: number
  protocolViolations: number
  complianceRate: number
  turns: TurnMetrics[]
}

export class TokenUsageTracker {
  private metrics: Map<string, AgentMetrics> = new Map()

  startTracking(agentName: string): void {
    this.metrics.set(agentName, {
      agentName,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalTokens: 0,
      totalTurns: 0,
      protocolViolations: 0,
      complianceRate: 1.0,
      turns: [],
    })
  }

  recordTurn(
    agentName: string,
    usage: TokenUsage,
    protocolViolations: number,
    hasNarration: boolean,
  ): void {
    const metrics = this.metrics.get(agentName)
    if (!metrics) return

    const turnNumber = metrics.totalTurns + 1

    metrics.totalInputTokens += usage.input
    metrics.totalOutputTokens += usage.output
    metrics.totalTokens += usage.total
    metrics.totalTurns = turnNumber
    metrics.protocolViolations += protocolViolations

    metrics.turns.push({
      turnNumber,
      inputTokens: usage.input,
      outputTokens: usage.output,
      totalTokens: usage.total,
      protocolViolations,
      hasNarration,
    })

    metrics.complianceRate = this.calculateComplianceRate(metrics)
  }

  getMetrics(agentName: string): AgentMetrics | undefined {
    return this.metrics.get(agentName)
  }

  getAllMetrics(): AgentMetrics[] {
    return Array.from(this.metrics.values())
  }

  private calculateComplianceRate(metrics: AgentMetrics): number {
    if (metrics.totalTurns === 0) return 1.0

    const compliantTurns = metrics.turns.filter(
      (t) => t.protocolViolations === 0 && !t.hasNarration
    ).length

    return compliantTurns / metrics.totalTurns
  }

  reset(agentName: string): void {
    this.metrics.delete(agentName)
  }

  resetAll(): void {
    this.metrics.clear()
  }
}
