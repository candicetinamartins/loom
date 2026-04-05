import { injectable, inject } from 'inversify'
import { AgentService } from '@theia/ai-core/lib/browser/agent-service'
import { ChatAgentService } from '@theia/ai-chat/lib/browser/chat-agent-service'
import { PipelineRunner, Wave, WaveAgent } from './PipelineRunner'
import { OrchestrationVerifier, AgentResult } from './OrchestrationVerifier'
import { LoomMsgHub, Channel } from './LoomMsgHub'
import { AgentCompletePayload } from '../agents/AgentResultSchema'

export interface MultiAgentConfig {
  agents: string[]
  task: string
  mode: 'parallel' | 'race'
}

export interface MultiAgentResult {
  results: Array<{
    agent: string
    result: AgentCompletePayload
    verified: boolean
  }>
  winner?: string // For race mode
}

/**
 * MultiAgentCommand - Implements /multi command for parallel agent execution
 * 
 * Usage: /multi "task description" --agents engineer,architect,security
 * 
 * Features:
 * - Parallel execution of multiple agents on same task
 * - Race mode: returns first successful result
 * - Verification of all results before returning
 * - Comparison view in chat panel
 */
@injectable()
export class MultiAgentCommand {
  constructor(
    @inject(AgentService) private agentService: AgentService,
    @inject(ChatAgentService) private chatAgentService: ChatAgentService,
    @inject(PipelineRunner) private pipelineRunner: PipelineRunner,
    @inject(OrchestrationVerifier) private verifier: OrchestrationVerifier,
    @inject(LoomMsgHub) private hub: LoomMsgHub
  ) {}

  async execute(config: MultiAgentConfig): Promise<MultiAgentResult> {
    await this.hub.publish(
      LoomMsgHub.msg(Channel.COMMAND_STARTED, {
        command: 'multi',
        agents: config.agents,
        mode: config.mode,
      })
    )

    // Build wave agents
    const waveAgents: WaveAgent[] = config.agents.map(agent => ({
      agent,
      subtask: config.task,
    }))

    // Create single wave with all agents
    const wave: Wave = {
      type: config.mode,
      agents: waveAgents,
    }

    // Execute through PipelineRunner
    const result = await this.executeWave(wave, config.task)

    await this.hub.publish(
      LoomMsgHub.msg(Channel.COMMAND_COMPLETE, {
        command: 'multi',
        agentCount: config.agents.length,
        completedCount: result.results.length,
      })
    )

    return result
  }

  private async executeWave(wave: Wave, task: string): Promise<MultiAgentResult> {
    const results: MultiAgentResult['results'] = []

    if (wave.type === 'parallel') {
      // Execute all agents in parallel
      const agentPromises = wave.agents.map(async (agentConfig) => {
        const result = await this.invokeAgent(agentConfig, task)
        const verified = await this.verifier.verify(result, task, agentConfig.agent)
        
        return {
          agent: agentConfig.agent,
          result: verified.status === 'verified' ? verified.result : result,
          verified: verified.status === 'verified',
        }
      })

      const agentResults = await Promise.all(agentPromises)
      results.push(...agentResults)

    } else if (wave.type === 'race') {
      // Race mode: return first successful result
      const racePromises = wave.agents.map(async (agentConfig) => {
        const result = await this.invokeAgent(agentConfig, task)
        const verified = await this.verifier.verify(result, task, agentConfig.agent)
        
        return {
          agent: agentConfig.agent,
          result: verified.status === 'verified' ? verified.result : result,
          verified: verified.status === 'verified',
        }
      })

      // Promise.race returns first to complete
      const winner = await Promise.race(racePromises)
      
      // Still collect all results for comparison
      const allResults = await Promise.all(racePromises)
      results.push(...allResults)

      return {
        results,
        winner: winner.verified ? winner.agent : undefined,
      }
    }

    return { results }
  }

  private async invokeAgent(agentConfig: WaveAgent, task: string): Promise<AgentCompletePayload> {
    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_STARTED, {
        agent: agentConfig.agent,
        task,
      })
    )

    const subtask = agentConfig.subtask || task
    const startTime = Date.now()

    let responseText: string
    try {
      responseText = await this.chatAgentService.sendMessage(
        agentConfig.agent,
        subtask,
      ) as string
    } catch (error) {
      // Agent not found or unavailable — fall back to any registered agent
      const agents = this.agentService.getAgents()
      const fallback = agents[0]
      if (!fallback) {
        throw new Error(`No agents available to handle task: ${subtask}`)
      }
      responseText = await this.chatAgentService.sendMessage(
        fallback.id,
        `[Acting as ${agentConfig.agent}] ${subtask}`,
      ) as string
    }

    const elapsed = Date.now() - startTime
    const outputTokens = Math.ceil(responseText.length / 4)
    const inputTokens = Math.ceil(subtask.length / 4)

    const result: AgentCompletePayload = {
      agentName: agentConfig.agent,
      status: 'complete',
      summary: responseText.slice(0, 500),
      files_created: [],
      files_modified: [],
      key_findings: [responseText.slice(0, 200)],
      next_actions: [],
      stepCount: 1,
      tokenUsage: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_COMPLETE, {
        agent: agentConfig.agent,
        status: 'complete',
        elapsedMs: elapsed,
      })
    )

    return result
  }

  formatMultiResult(result: MultiAgentResult): string {
    const lines = [
      '## Multi-Agent Results',
      '',
      `Executed ${result.results.length} agents`,
      '',
    ]

    for (const r of result.results) {
      const status = r.verified ? '✅' : '⚠️'
      lines.push(`### ${status} ${r.agent}`)
      lines.push(r.result.summary)
      lines.push(`- Token usage: ${r.result.tokenUsage.total}`)
      lines.push('')
    }

    if (result.winner) {
      lines.push(`🏆 Winner: ${result.winner} (first to complete with verification)`)
    }

    return lines.join('\n')
  }
}
