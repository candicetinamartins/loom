import { z } from 'zod'
import { LoomMsgHub, Channel } from './LoomMsgHub'
import { AgentResultSchema, AgentResult, AgentCompletePayload } from '../agents/AgentResultSchema'

export { AgentResultSchema, AgentResult, AgentCompletePayload } from '../agents/AgentResultSchema'

export interface VerifiedResult {
  status: 'verified' | 'quarantined'
  result: AgentResult
  agentName: string
  reason?: string
}

export class OrchestrationVerifier {
  constructor(private hub: LoomMsgHub) {}

  async verify(
    result: AgentCompletePayload,
    originalTask: string,
    agentName: string,
  ): Promise<VerifiedResult> {
    const { status, summary, key_findings, files_modified } = result

    // Level 1: Schema check
    const schemaCheck = AgentResultSchema.safeParse(result)
    if (!schemaCheck.success) {
      return this.quarantine(result, agentName, 'schema_invalid')
    }

    // Level 2: Completeness check
    if (this.expectsFindings(agentName) && key_findings.length === 0) {
      return this.quarantine(result, agentName, 'findings_empty')
    }

    const genericPhrases = ['done', 'complete', 'finished', 'task complete']
    if (genericPhrases.includes(summary.toLowerCase().trim())) {
      return this.quarantine(result, agentName, 'summary_generic')
    }

    // Level 3: Semantic check (only when suspicious)
    if (this.looksSuspicious(result, agentName)) {
      const check = await this.semanticCheck(result, originalTask, agentName)
      if (!check.passed) {
        return this.quarantine(result, agentName, 'semantic_mismatch')
      }
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.RESULT_VERIFIED, {
        agentName,
        result: schemaCheck.data,
      })
    )

    return { status: 'verified', result: schemaCheck.data, agentName }
  }

  private expectsFindings(agentName: string): boolean {
    return ['security', 'reviewer', 'architect'].includes(agentName)
  }

  private looksSuspicious(result: AgentCompletePayload, agentName: string): boolean {
    return (
      result.summary.length < 20 ||
      (result.files_modified.length === 0 && result.status === 'complete')
    )
  }

  private async semanticCheck(
    result: AgentCompletePayload,
    originalTask: string,
    agentName: string,
  ): Promise<{ passed: boolean }> {
    // In a real implementation, this would use Haiku to semantically verify
    // For now, we'll implement a basic heuristic check
    const taskKeywords = originalTask.toLowerCase().split(/\s+/)
    const summaryLower = result.summary.toLowerCase()

    const hasRelevantKeywords = taskKeywords.some(keyword =>
      summaryLower.includes(keyword)
    )

    return { passed: hasRelevantKeywords }
  }

  private quarantine(
    result: AgentCompletePayload,
    agentName: string,
    reason: string,
  ): VerifiedResult {
    const quarantinedResult: AgentResult = {
      status: result.status,
      summary: result.summary,
      files_created: result.files_created,
      files_modified: result.files_modified,
      key_findings: [],
      next_actions: [`[MANUAL REVIEW REQUIRED] ${agentName} output flagged: ${reason}`],
    }

    this.hub.publish(
      LoomMsgHub.msg(Channel.RESULT_QUARANTINED, {
        agentName,
        result: quarantinedResult,
        reason,
      })
    )

    return {
      status: 'quarantined',
      result: quarantinedResult,
      agentName,
      reason,
    }
  }
}
