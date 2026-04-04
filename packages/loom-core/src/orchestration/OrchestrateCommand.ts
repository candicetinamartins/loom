import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '../config/TOMLParser'
import { PipelineRunner, PipelinePlan, Wave } from './PipelineRunner'
import { LoomMsgHub, Channel } from './LoomMsgHub'

export interface OrchestrateConfig {
  task: string
  planPath?: string
  autoApprove?: boolean
}

export interface WaveApproval {
  waveIndex: number
  approved: boolean
  modifiedAgents?: string[]
}

/**
 * OrchestrateCommand - Implements /orchestrate command with TOML plans
 * 
 * Usage: /orchestrate "implement user auth" --plan auth-plan.toml
 * 
 * Features:
 * - Loads TOML plan with waves of agent execution
 * - User approval between waves
 * - Wave-by-wave execution with progress tracking
 * - Can modify plan between waves
 */
@injectable()
export class OrchestrateCommand {
  private parser = new TOMLParser()

  constructor(
    @inject(PipelineRunner) private pipelineRunner: PipelineRunner,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string
  ) {}

  async execute(config: OrchestrateConfig): Promise<void> {
    await this.hub.publish(
      LoomMsgHub.msg(Channel.COMMAND_STARTED, {
        command: 'orchestrate',
        task: config.task,
      })
    )

    // Load or generate plan
    let plan: PipelinePlan
    
    if (config.planPath) {
      plan = await this.loadPlanFromFile(config.planPath)
    } else {
      plan = await this.generatePlan(config.task)
    }

    // Execute wave by wave with approval
    for (let i = 0; i < plan.waves.length; i++) {
      const wave = plan.waves[i]
      
      // Show wave details and request approval (unless auto-approved)
      if (!config.autoApprove) {
        const approval = await this.requestWaveApproval(i, wave, plan)
        if (!approval.approved) {
          await this.hub.publish(
            LoomMsgHub.msg(Channel.WAVE_SKIPPED, {
              waveIndex: i,
              reason: 'User rejected',
            })
          )
          continue
        }
        
        // Apply any modifications
        if (approval.modifiedAgents) {
          wave.agents = wave.agents.filter(a => 
            approval.modifiedAgents!.includes(a.agent)
          )
        }
      }

      // Execute the wave
      await this.hub.publish(
        LoomMsgHub.msg(Channel.WAVE_STARTED, {
          waveIndex: i,
          agentCount: wave.agents.length,
          type: wave.type,
        })
      )

      // Create mini-plan for just this wave
      const wavePlan: PipelinePlan = {
        task: `${plan.task} (wave ${i + 1}/${plan.waves.length})`,
        waves: [wave],
      }

      await this.pipelineRunner.execute(wavePlan)

      await this.hub.publish(
        LoomMsgHub.msg(Channel.WAVE_COMPLETE, {
          waveIndex: i,
        })
      )
    }

    await this.hub.publish(
      LoomMsgHub.msg(Channel.COMMAND_COMPLETE, {
        command: 'orchestrate',
        wavesCompleted: plan.waves.length,
      })
    )
  }

  private async loadPlanFromFile(filePath: string): Promise<PipelinePlan> {
    const fullPath = path.isAbsolute(filePath) 
      ? filePath 
      : path.join(this.workspaceRoot, filePath)
    
    const content = await fs.readFile(fullPath, 'utf-8')
    const parsed = await this.parser.parse(content)

    // Convert parsed TOML to PipelinePlan format
    return this.convertTOMLToPlan(parsed)
  }

  private async generatePlan(task: string): Promise<PipelinePlan> {
    // Generate a default plan based on the task
    // In production, this might use the orchestrator agent to generate the plan
    
    return {
      task,
      waves: [
        {
          type: 'parallel',
          agents: [
            { agent: 'architect', subtask: `Design: ${task}` },
            { agent: 'researcher', subtask: `Research: ${task}` },
          ],
        },
        {
          type: 'sequential',
          depends_on: 0,
          agents: [
            { agent: 'engineer', subtask: `Implement: ${task}` },
          ],
        },
        {
          type: 'parallel',
          depends_on: 1,
          agents: [
            { agent: 'reviewer', subtask: `Review: ${task}` },
            { agent: 'security', subtask: `Security check: ${task}` },
            { agent: 'qa', subtask: `Test plan: ${task}` },
          ],
        },
      ],
    }
  }

  private convertTOMLToPlan(parsed: any): PipelinePlan {
    const waves: Wave[] = []
    
    // Handle different TOML structures
    if (parsed.waves) {
      for (const waveData of parsed.waves) {
        const wave: Wave = {
          type: waveData.type || 'sequential',
          agents: waveData.agents?.map((a: any) => ({
            agent: a.name,
            subtask: a.task,
            context_from: a.context_from,
          })) || [],
        }
        
        if (waveData.depends_on !== undefined) {
          wave.depends_on = waveData.depends_on
        }
        
        if (waveData.max_iterations !== undefined) {
          wave.max_iterations = waveData.max_iterations
        }
        
        waves.push(wave)
      }
    }

    return {
      task: parsed.task || 'Orchestrated task',
      waves,
    }
  }

  private async requestWaveApproval(
    waveIndex: number,
    wave: Wave,
    plan: PipelinePlan
  ): Promise<WaveApproval> {
    // In a real implementation, this would show a dialog to the user
    // For now, auto-approve in development
    
    return {
      waveIndex,
      approved: true,
    }
  }

  formatPlanPreview(plan: PipelinePlan): string {
    const lines = [
      '# Orchestration Plan',
      '',
      `Task: ${plan.task}`,
      `Waves: ${plan.waves.length}`,
      '',
    ]

    plan.waves.forEach((wave, i) => {
      lines.push(`## Wave ${i + 1}: ${wave.type}`)
      
      if (wave.depends_on !== undefined) {
        lines.push(`Depends on: Wave ${wave.depends_on + 1}`)
      }
      
      lines.push('')
      lines.push('Agents:')
      wave.agents.forEach(agent => {
        lines.push(`- ${agent.agent}: ${agent.subtask}`)
      })
      lines.push('')
    })

    return lines.join('\n')
  }
}
