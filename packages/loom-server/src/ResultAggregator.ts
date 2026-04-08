import { injectable, inject } from 'inversify'
import { LoomMsgHub, Channel } from '@loom/graph'

export interface AgentResult {
  agentName: string
  sessionId: string
  status: 'success' | 'failure' | 'quarantined'
  summary?: string
  keyFindings?: string[]
  filesCreated?: string[]
  filesModified?: string[]
  nextActions?: string[]
  error?: string
  duration: number
  tokenUsage: {
    input: number
    output: number
    total: number
  }
}

export interface AggregatedResult {
  task: string
  totalAgents: number
  successful: number
  failed: number
  quarantined: number
  totalDuration: number
  totalTokens: number
  results: AgentResult[]
  combinedSummary: string
  allFilesCreated: string[]
  allFilesModified: string[]
  recommendedNextSteps: string[]
}

/**
 * ResultAggregator — Aggregate results from multi-agent execution
 * 
 * Features:
 * - Collect results from multiple agents
 * - Deduplicate file changes
 * - Generate combined summary
 * - Track success/failure rates
 */
@injectable()
export class ResultAggregator {
  private results: Map<string, AgentResult> = new Map()

  constructor(@inject(LoomMsgHub) private hub: LoomMsgHub) {}

  /**
   * Add a result from an agent
   */
  addResult(result: AgentResult): void {
    this.results.set(result.sessionId, result)

    // Publish result event
    this.hub.publish(
      LoomMsgHub.msg(Channel.RESULT_FINAL, {
        sessionId: result.sessionId,
        agentName: result.agentName,
        status: result.status,
        summary: result.summary,
      })
    )
  }

  /**
   * Get results for a specific agent
   */
  getResult(sessionId: string): AgentResult | undefined {
    return this.results.get(sessionId)
  }

  /**
   * Get all results
   */
  getAllResults(): AgentResult[] {
    return Array.from(this.results.values())
  }

  /**
   * Aggregate all results for a task
   */
  aggregate(task: string): AggregatedResult {
    const allResults = this.getAllResults()
    
    const successful = allResults.filter(r => r.status === 'success')
    const failed = allResults.filter(r => r.status === 'failure')
    const quarantined = allResults.filter(r => r.status === 'quarantined')

    // Deduplicate file changes
    const allFilesCreated = [...new Set(allResults.flatMap(r => r.filesCreated || []))]
    const allFilesModified = [...new Set(allResults.flatMap(r => r.filesModified || []))]

    // Collect next actions
    const recommendedNextSteps = [...new Set(allResults.flatMap(r => r.nextActions || []))]

    // Calculate totals
    const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0)
    const totalTokens = allResults.reduce((sum, r) => sum + r.tokenUsage.total, 0)

    // Generate combined summary
    const combinedSummary = this.generateCombinedSummary(task, allResults)

    return {
      task,
      totalAgents: allResults.length,
      successful: successful.length,
      failed: failed.length,
      quarantined: quarantined.length,
      totalDuration,
      totalTokens,
      results: allResults,
      combinedSummary,
      allFilesCreated,
      allFilesModified,
      recommendedNextSteps,
    }
  }

  /**
   * Clear all results
   */
  clear(): void {
    this.results.clear()
  }

  /**
   * Clear results for a specific task
   */
  clearTask(task: string): void {
    for (const [id, result] of this.results) {
      if (result.sessionId.startsWith(task)) {
        this.results.delete(id)
      }
    }
  }

  private generateCombinedSummary(task: string, results: AgentResult[]): string {
    const lines: string[] = []
    lines.push(`# Task: ${task}`)
    lines.push('')
    
    const successful = results.filter(r => r.status === 'success')
    const failed = results.filter(r => r.status === 'failure')
    
    lines.push(`## Summary`)
    lines.push(`- Total agents: ${results.length}`)
    lines.push(`- Successful: ${successful.length}`)
    lines.push(`- Failed: ${failed.length}`)
    lines.push(`- Total tokens: ${results.reduce((s, r) => s + r.tokenUsage.total, 0).toLocaleString()}`)
    lines.push('')

    if (successful.length > 0) {
      lines.push(`## Completed Work`)
      for (const r of successful) {
        if (r.summary) {
          lines.push(`- **${r.agentName}**: ${r.summary}`)
        }
      }
      lines.push('')
    }

    if (failed.length > 0) {
      lines.push(`## Issues`)
      for (const r of failed) {
        lines.push(`- **${r.agentName}**: ${r.error || 'Failed'}`)
      }
      lines.push('')
    }

    const allFiles = [...new Set(results.flatMap(r => [...(r.filesCreated || []), ...(r.filesModified || [])]))]
    if (allFiles.length > 0) {
      lines.push(`## Files Changed`)
      for (const f of allFiles.slice(0, 20)) {
        lines.push(`- ${f}`)
      }
      if (allFiles.length > 20) {
        lines.push(`- ... and ${allFiles.length - 20} more`)
      }
    }

    return lines.join('\n')
  }
}
