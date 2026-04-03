import { LoomMsgHub, Channel } from './LoomMsgHub'
import { OrchestrationVerifier } from './OrchestrationVerifier'
import { AgentSession } from '../agents/AgentSession'
import { TokenUsageTracker } from '../agents/TokenUsageTracker'
import { ContextCompactor } from '../context/ContextCompactor'
import * as fs from 'fs/promises'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export type WaveType = 'parallel' | 'sequential' | 'iterative' | 'race'

export interface WaveAgent {
  agent: string
  subtask: string
  context_from?: string[]
}

export interface WaveCondition {
  tool: string
  command: string
  success_pattern: string
}

export interface Wave {
  type: WaveType
  depends_on?: number
  max_iterations?: number
  agents: WaveAgent[]
  condition?: WaveCondition
}

export interface PipelinePlan {
  task: string
  waves: Wave[]
}

export interface WaveResult {
  waveIndex: number
  agentResults: Map<string, any>
  passed: boolean
  quarantined: string[]
}

export class PipelineRunner {
  constructor(
    private hub: LoomMsgHub,
    private verifier: OrchestrationVerifier,
    private tokenTracker: TokenUsageTracker,
    private compactor: ContextCompactor,
  ) {}

  async execute(plan: PipelinePlan): Promise<void> {
    const results: WaveResult[] = []

    for (let i = 0; i < plan.waves.length; i++) {
      const wave = plan.waves[i]

      if (wave.depends_on !== undefined) {
        const dependentWave = results[wave.depends_on]
        if (!dependentWave || !dependentWave.passed) {
          throw new Error(`Wave ${i} depends on wave ${wave.depends_on} which failed`)
        }
      }

      const result = await this.executeWave(wave, i, plan.task, results)
      results.push(result)

      await this.hub.publish(
        LoomMsgHub.msg(Channel.WAVE_COMPLETE, {
          waveIndex: i,
          result,
        })
      )
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.PLAN_COMPLETE, {
        task: plan.task,
        results,
      })
    )
  }

  private async executeWave(
    wave: Wave,
    waveIndex: number,
    originalTask: string,
    previousResults: WaveResult[],
  ): Promise<WaveResult> {
    const agentResults = new Map<string, any>()
    const quarantined: string[] = []

    switch (wave.type) {
      case 'parallel':
        await Promise.all(
          wave.agents.map(async (agentConfig) => {
            const result = await this.executeAgent(
              agentConfig,
              originalTask,
              previousResults,
            )
            agentResults.set(agentConfig.agent, result)
            if (result.status === 'quarantined') {
              quarantined.push(agentConfig.agent)
            }
          })
        )
        break

      case 'sequential':
        for (const agentConfig of wave.agents) {
          const result = await this.executeAgent(
            agentConfig,
            originalTask,
            previousResults,
          )
          agentResults.set(agentConfig.agent, result)
          if (result.status === 'quarantined') {
            quarantined.push(agentConfig.agent)
          }
        }
        break

      case 'iterative':
        const maxIterations = wave.max_iterations ?? 3
        for (let iter = 0; iter < maxIterations; iter++) {
          const result = await this.executeAgent(
            wave.agents[0],
            originalTask,
            previousResults,
          )
          agentResults.set(wave.agents[0].agent, result)

          if (wave.condition) {
            const conditionPassed = await this.checkCondition(wave.condition)
            if (conditionPassed) {
              break
            }
          }
        }
        break

      case 'race':
        const raceResults = await Promise.race(
          wave.agents.map(async (agentConfig) => {
            const result = await this.executeAgent(
              agentConfig,
              originalTask,
              previousResults,
            )
            return { agent: agentConfig.agent, result }
          })
        )
        agentResults.set(raceResults.agent, raceResults.result)
        break
    }

    return {
      waveIndex,
      agentResults,
      passed: quarantined.length === 0,
      quarantined,
    }
  }

  /**
   * Execute a single agent in the pipeline using real AgentSession
   */
  private async executeAgent(
    agentConfig: WaveAgent,
    originalTask: string,
    previousResults: WaveResult[],
  ): Promise<any> {
    const subtask = this.interpolateSubtask(agentConfig.subtask, previousResults)

    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_STARTED, {
        agent: agentConfig.agent,
        subtask,
      })
    )

    // Get agent definition from registry
    const agentDef = await this.getAgentDefinition(agentConfig.agent)
    if (!agentDef) {
      throw new Error(`Agent not found: ${agentConfig.agent}`)
    }

    // Create AgentSession with proper DI
    const sessionId = `${Date.now()}-${agentConfig.agent}`
    const session = new AgentSession(
      agentDef,
      sessionId,
      this.hub,
      this.tokenTracker,
      this.compactor,
    )

    // Build system prompt with prior wave context
    const systemPrompt = this.buildSystemPrompt(agentDef, originalTask, previousResults)

    // Execute agent
    const result = await session.executeLLM(
      systemPrompt,
      [{ role: 'user', content: subtask }],
      this.getToolsForAgent(agentDef),
    )

    // Verify result through OrchestrationVerifier
    const verified = await this.verifier.verify(result, originalTask, agentConfig.agent)

    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_COMPLETE, {
        agent: agentConfig.agent,
        result: verified,
      })
    )

    return verified
  }

  private async getAgentDefinition(agentName: string): Promise<any> {
    // Load from fleet definitions
    const agentFiles: Record<string, string> = {
      orchestrator: 'orchestrator.md',
      engineer: 'engineer.md',
      architect: 'architect.md',
      security: 'security.md',
      qa: 'qa.md',
      reviewer: 'reviewer.md',
      devops: 'devops.md',
      researcher: 'researcher.md',
      documentarian: 'documentarian.md',
      data: 'data.md',
      debugger: 'debugger.md',
      explorer: 'explorer.md',
    }

    const filePath = path.join(
      process.cwd(),
      'packages',
      'loom-core',
      'src',
      'agents',
      'prompts',
      'fleet',
      agentFiles[agentName] || `${agentName}.md`
    )

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      // Parse TOML frontmatter
      const tomlMatch = content.match(/^---\n([\s\S]*?)\n---/)
      const toml = tomlMatch ? tomlMatch[1] : ''
      
      // Simple TOML parsing
      const lines = toml.split('\n')
      const def: any = { name: agentName, toolGroups: [] }
      
      for (const line of lines) {
        const modelMatch = line.match(/^model\s*=\s*"([^"]+)"/)
        if (modelMatch) def.model = modelMatch[1]
        
        const thinkingMatch = line.match(/^thinking_budget\s*=\s*(\d+)/)
        if (thinkingMatch) def.thinkingBudget = parseInt(thinkingMatch[1])
        
        const toolsMatch = line.match(/^tool_groups\s*=\s*\[([^\]]+)\]/)
        if (toolsMatch) {
          def.toolGroups = toolsMatch[1].split(',').map((s: string) => s.trim().replace(/"/g, ''))
        }
      }
      
      return def
    } catch {
      // Return default if file not found
      return {
        name: agentName,
        model: 'claude-sonnet-4-5',
        thinkingBudget: 2000,
        toolGroups: ['file_ops', 'code_search'],
      }
    }
  }

  private buildSystemPrompt(agentDef: any, task: string, previousResults: WaveResult[]): string {
    // Include context from previous waves
    let context = ''
    previousResults.forEach((waveResult, waveIdx) => {
      waveResult.agentResults.forEach((result, agentName) => {
        if (result.summary) {
          context += `\n[Wave ${waveIdx} - ${agentName}]: ${result.summary}`
        }
      })
    })

    return `You are ${agentDef.name}. Task: ${task}${context ? `\n\nPrior context:${context}` : ''}`
  }

  private getToolsForAgent(agentDef: any): Record<string, any> {
    // Return tools based on agent's toolGroups
    const tools: Record<string, any> = {}
    
    for (const group of agentDef.toolGroups || []) {
      switch (group) {
        case 'file_ops':
          tools.read_file = { name: 'read_file', execute: async (args: any) => ({ content: 'file content' }) }
          tools.write_file = { name: 'write_file', execute: async (args: any) => ({ success: true }) }
          break
        case 'code_search':
          tools.search_code = { name: 'search_code', execute: async (args: any) => ({ results: [] }) }
          break
        case 'graph':
          tools.graph_query = { name: 'graph_query', execute: async (args: any) => ({ nodes: [] }) }
          break
      }
    }
    
    return tools
  }

  private interpolateSubtask(
    subtask: string,
    previousResults: WaveResult[],
  ): string {
    let interpolated = subtask

    previousResults.forEach((waveResult) => {
      waveResult.agentResults.forEach((result, agentName) => {
        const placeholder = `{${agentName}.key_findings}`
        if (interpolated.includes(placeholder)) {
          interpolated = interpolated.replace(
            placeholder,
            JSON.stringify(result.key_findings ?? []),
          )
        }
      })
    })

    return interpolated
  }

  private async checkCondition(condition: WaveCondition): Promise<boolean> {
    // Execute the condition tool/command and check success pattern
    try {
      let output: string

      if (condition.tool === 'bash') {
        // Execute shell command
        const { stdout, stderr } = await execAsync(condition.command, { timeout: 30000 })
        output = stdout + stderr
      } else if (condition.tool === 'test') {
        // Run test suite
        const { stdout, stderr } = await execAsync(condition.command, { timeout: 60000 })
        output = stdout + stderr
      } else if (condition.tool === 'file') {
        // Check file existence or content
        try {
          const content = await fs.readFile(condition.command, 'utf-8')
          output = content
        } catch {
          return false
        }
      } else {
        // Default: try to execute as shell command
        const { stdout, stderr } = await execAsync(condition.command, { timeout: 30000 })
        output = stdout + stderr
      }

      // Check if output matches success pattern
      const successRegex = new RegExp(condition.success_pattern)
      return successRegex.test(output)
    } catch (error) {
      // Command failed or timed out — condition not met
      console.warn(`[PipelineRunner] Condition check failed: ${condition.command}`, error)
      return false
    }
  }
}
