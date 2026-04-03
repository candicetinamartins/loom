import { injectable, inject } from 'inversify'
import * as fs from 'fs/promises'
import * as path from 'path'
import { TOMLParser } from '@loom/core'
import { FileService } from '@theia/filesystem/lib/browser/file-service'
import { TerminalService } from '@theia/terminal/lib/browser/terminal-service'
import { AgentSession } from '@loom/core'
import { LoomMsgHub, Channel } from './LoomMsgHub'

/**
 * Phase 4 — Agent Hooks
 * 
 * HookService bridges Theia IDE events to Loom's hook trigger system.
 * Supports 15 event types and 4 action types with pipeline composition.
 * 
 * 15 Event Types:
 * - fileSaved, fileCreated, fileDeleted, fileMoved
 * - gitPreCommit, gitPostCommit, gitPrePush, gitPostMerge
 * - testPass, testFail, testStart
 * - terminalIdle, terminalCommand, terminalError
 * - agentComplete, agentError
 * 
 * 4 Action Types:
 * - runCLI: Execute shell command
 * - askAgent: Run agent with prompt
 * - runScript: Execute Node.js/Python script
 * - updateContext: Modify conversation context
 */

export type HookEventType =
  | 'fileSaved' | 'fileCreated' | 'fileDeleted' | 'fileMoved'
  | 'gitPreCommit' | 'gitPostCommit' | 'gitPrePush' | 'gitPostMerge'
  | 'testPass' | 'testFail' | 'testStart'
  | 'terminalIdle' | 'terminalCommand' | 'terminalError'
  | 'agentComplete' | 'agentError'

export type HookActionType = 'runCLI' | 'askAgent' | 'runScript' | 'updateContext'
export type OnFailureMode = 'block' | 'warn' | 'notify'

export interface HookStep {
  id: string
  action: HookActionType
  config: Record<string, any>
  depends_on?: string[]
  on_failure?: OnFailureMode
  condition?: string  // Optional condition expression
}

export interface HookManifest {
  name: string
  description: string
  enabled: boolean
  event: HookEventType
  pattern?: string  // Glob pattern for file events
  priority?: number  // Execution order (lower = earlier)
  steps: HookStep[]
}

export interface HookExecutionResult {
  hookName: string
  success: boolean
  stepResults: Array<{
    stepId: string
    success: boolean
    output?: string
    error?: string
    durationMs: number
  }>
  blocked?: boolean  // If on_failure = 'block' and step failed
}

@injectable()
export class HookService {
  private hooks: Map<string, HookManifest> = new Map()
  private parser = new TOMLParser()
  private executing = new Set<string>()  // Prevent re-entry

  constructor(
    @inject('LOOM_WORKSPACE_ROOT') private workspaceRoot: string,
    @inject(FileService) private fileService: FileService,
    @inject(TerminalService) private terminalService: TerminalService,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
  ) {}

  async initialize(): Promise<void> {
    await this.loadAllHooks()
    this.subscribeToEvents()
    console.log(`[HookService] Loaded ${this.hooks.size} hooks`)
  }

  /**
   * Load all hooks from .loom/hooks/*.toml
   */
  private async loadAllHooks(): Promise<void> {
    const hooksDir = path.join(this.workspaceRoot, '.loom', 'hooks')
    
    try {
      const entries = await fs.readdir(hooksDir, { withFileTypes: true })
      
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.toml')) {
          try {
            const hook = await this.loadHook(path.join(hooksDir, entry.name))
            if (hook.enabled) {
              this.hooks.set(hook.name, hook)
            }
          } catch (error) {
            console.warn(`[HookService] Failed to load hook ${entry.name}:`, error)
          }
        }
      }
    } catch {
      // Hooks directory doesn't exist yet
    }
  }

  /**
   * Parse a single hook TOML file
   */
  private async loadHook(filePath: string): Promise<HookManifest> {
    const content = await fs.readFile(filePath, 'utf-8')
    const parsed = this.parser.parseSync(content)

    return {
      name: parsed.name || path.basename(filePath, '.toml'),
      description: parsed.description || '',
      enabled: parsed.enabled ?? true,
      event: parsed.event as HookEventType,
      pattern: parsed.pattern,
      priority: parsed.priority ?? 100,
      steps: (parsed.steps || []).map((step: any, index: number) => ({
        id: step.id || `step-${index}`,
        action: step.action as HookActionType,
        config: step.config || {},
        depends_on: step.depends_on,
        on_failure: step.on_failure || 'notify',
        condition: step.condition,
      })),
    }
  }

  /**
   * Subscribe to Theia events
   */
  private subscribeToEvents(): void {
    // File events
    this.fileService.onDidFilesChange(event => {
      event.changes.forEach(change => {
        const filePath = change.resource.fsPath
        
        switch (change.type) {
          case 1: // UPDATED
            this.trigger('fileSaved', { file: filePath })
            break
          case 0: // ADDED
            this.trigger('fileCreated', { file: filePath })
            break
          case 2: // DELETED
            this.trigger('fileDeleted', { file: filePath })
            break
        }
      })
    })

    // Terminal events
    this.terminalService.onDidWriteData(data => {
      this.trigger('terminalCommand', { output: data.slice(0, 200) })
    })

    // Agent events via hub
    this.hub.on(Channel.AGENT_COMPLETE, (msg: any) => {
      this.trigger('agentComplete', {
        agent: msg.payload.agentName,
        result: msg.payload.result,
      })
    })

    this.hub.on(Channel.RESULT_QUARANTINED, (msg: any) => {
      this.trigger('agentError', {
        agent: msg.payload.agentName,
        error: msg.payload.reason,
      })
    })
  }

  /**
   * Trigger hooks for a specific event
   */
  async trigger(
    event: HookEventType,
    context: Record<string, any>,
  ): Promise<HookExecutionResult[]> {
    const matchingHooks = Array.from(this.hooks.values())
      .filter(h => h.event === event)
      .filter(h => this.matchesPattern(h, context))
      .sort((a, b) => (a.priority || 100) - (b.priority || 100))

    const results: HookExecutionResult[] = []

    for (const hook of matchingHooks) {
      // Prevent re-entry
      if (this.executing.has(hook.name)) continue
      
      this.executing.add(hook.name)
      try {
        const result = await this.executeHook(hook, context)
        results.push(result)
      } finally {
        this.executing.delete(hook.name)
      }
    }

    return results
  }

  /**
   * Check if context matches hook pattern
   */
  private matchesPattern(hook: HookManifest, context: Record<string, any>): boolean {
    if (!hook.pattern) return true
    if (!context.file) return true

    const minimatch = require('minimatch')
    return minimatch(context.file, hook.pattern)
  }

  /**
   * Execute a single hook with all its steps
   */
  private async executeHook(
    hook: HookManifest,
    context: Record<string, any>,
  ): Promise<HookExecutionResult> {
    const stepResults: HookExecutionResult['stepResults'] = []
    const completedSteps = new Set<string>()
    let blocked = false

    // Topological sort by dependencies
    const sortedSteps = this.sortSteps(hook.steps)

    for (const step of sortedSteps) {
      // Check condition
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        stepResults.push({
          stepId: step.id,
          success: true,  // Skipped = not failed
          output: 'Skipped (condition not met)',
          durationMs: 0,
        })
        continue
      }

      // Check dependencies
      const depsMet = (step.depends_on || []).every(id => completedSteps.has(id))
      if (!depsMet) {
        stepResults.push({
          stepId: step.id,
          success: false,
          error: 'Dependencies not met',
          durationMs: 0,
        })
        if (step.on_failure === 'block') {
          blocked = true
          break
        }
        continue
      }

      // Execute step
      const startTime = Date.now()
      try {
        const output = await this.executeStep(step, context)
        stepResults.push({
          stepId: step.id,
          success: true,
          output: output?.slice(0, 500),  // Truncate long outputs
          durationMs: Date.now() - startTime,
        })
        completedSteps.add(step.id)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error)
        stepResults.push({
          stepId: step.id,
          success: false,
          error: errorMsg,
          durationMs: Date.now() - startTime,
        })

        switch (step.on_failure) {
          case 'block':
            blocked = true
            break
          case 'warn':
            this.hub.publish(Channel.HOOK_WARNING, {
              hook: hook.name,
              step: step.id,
              error: errorMsg,
            })
            break
          case 'notify':
            this.hub.publish(Channel.HOOK_NOTIFICATION, {
              hook: hook.name,
              step: step.id,
              error: errorMsg,
            })
            break
        }

        if (blocked) break
      }
    }

    return {
      hookName: hook.name,
      success: stepResults.every(r => r.success),
      stepResults,
      blocked,
    }
  }

  /**
   * Execute a single step based on its action type
   */
  private async executeStep(
    step: HookStep,
    context: Record<string, any>,
  ): Promise<string> {
    switch (step.action) {
      case 'runCLI':
        return this.executeCLI(step.config, context)
      
      case 'askAgent':
        return this.executeAskAgent(step.config, context)
      
      case 'runScript':
        return this.executeScript(step.config, context)
      
      case 'updateContext':
        return this.executeUpdateContext(step.config, context)
      
      default:
        throw new Error(`Unknown action type: ${step.action}`)
    }
  }

  /**
   * Execute shell command
   */
  private async executeCLI(
    config: Record<string, any>,
    context: Record<string, any>,
  ): Promise<string> {
    const { command, cwd, timeout = 30000 } = config
    const interpolated = this.interpolateTemplate(command, context)
    
    const { exec } = require('child_process')
    const { promisify } = require('util')
    const execAsync = promisify(exec)

    const { stdout, stderr } = await execAsync(interpolated, {
      cwd: cwd || this.workspaceRoot,
      timeout,
    })

    return stdout || stderr
  }

  /**
   * Run an agent with a prompt
   */
  private async executeAskAgent(
    config: Record<string, any>,
    context: Record<string, any>,
  ): Promise<string> {
    const { agent, prompt, ephemeral = true } = config
    const interpolated = this.interpolateTemplate(prompt, context)

    // Create ephemeral agent session
    const session = new AgentSession(agent, `hook-${Date.now()}`, 0)
    
    // Execute and return result
    const result = await session.executeLLM(interpolated, [], [])
    
    return JSON.stringify(result)
  }

  /**
   * Execute Node.js or Python script
   */
  private async executeScript(
    config: Record<string, any>,
    context: Record<string, any>,
  ): Promise<string> {
    const { script, language = 'node', args = [] } = config
    
    const interpolatedArgs = args.map((arg: string) => 
      this.interpolateTemplate(arg, context)
    )

    const { spawn } = require('child_process')
    const cmd = language === 'python' ? 'python3' : 'node'
    
    return new Promise((resolve, reject) => {
      const proc = spawn(cmd, [script, ...interpolatedArgs], {
        cwd: this.workspaceRoot,
      })
      
      let output = ''
      proc.stdout.on('data', (data: Buffer) => output += data.toString())
      proc.stderr.on('data', (data: Buffer) => output += data.toString())
      
      proc.on('close', (code: number) => {
        if (code === 0) {
          resolve(output)
        } else {
          reject(new Error(`Script exited with code ${code}: ${output}`))
        }
      })
    })
  }

  /**
   * Update conversation context
   */
  private async executeUpdateContext(
    config: Record<string, any>,
    context: Record<string, any>,
  ): Promise<string> {
    const { key, value } = config
    const interpolatedValue = this.interpolateTemplate(value, context)
    
    // Publish to hub for context managers to pick up
    this.hub.publish(Channel.HOOK_CONTEXT_UPDATE, {
      key,
      value: interpolatedValue,
      source: context,
    })
    
    return `Updated context: ${key} = ${interpolatedValue}`
  }

  /**
   * Interpolate {{variable}} templates
   */
  private interpolateTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] !== undefined ? String(context[key]) : match
    })
  }

  /**
   * Evaluate condition expression
   */
  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    // Simple condition evaluation: "file matches '*.ts'" or "agent == 'security'"
    // For production, use a proper expression parser
    try {
      const [key, op, value] = condition.split(' ')
      const contextValue = context[key]
      
      switch (op) {
        case '==':
          return contextValue == value
        case '!=':
          return contextValue != value
        case 'matches':
          const minimatch = require('minimatch')
          return minimatch(contextValue, value.replace(/['"]/g, ''))
        default:
          return true
      }
    } catch {
      return true  // Fail open
    }
  }

  /**
   * Topological sort of steps by dependencies
   */
  private sortSteps(steps: HookStep[]): HookStep[] {
    const result: HookStep[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (step: HookStep) => {
      if (visited.has(step.id)) return
      if (visiting.has(step.id)) {
        throw new Error(`Circular dependency detected in hook steps: ${step.id}`)
      }

      visiting.add(step.id)

      // Visit dependencies first
      for (const depId of step.depends_on || []) {
        const dep = steps.find(s => s.id === depId)
        if (dep) visit(dep)
      }

      visiting.delete(step.id)
      visited.add(step.id)
      result.push(step)
    }

    for (const step of steps) {
      visit(step)
    }

    return result
  }

  /**
   * Get all registered hooks
   */
  getHooks(): HookManifest[] {
    return Array.from(this.hooks.values())
  }

  /**
   * Enable/disable a hook
   */
  async setHookEnabled(name: string, enabled: boolean): Promise<void> {
    const hook = this.hooks.get(name)
    if (!hook) throw new Error(`Hook not found: ${name}`)
    
    hook.enabled = enabled
    
    // Update file
    const hooksDir = path.join(this.workspaceRoot, '.loom', 'hooks')
    const filePath = path.join(hooksDir, `${name}.toml`)
    
    const content = await fs.readFile(filePath, 'utf-8')
    const updated = content.replace(
      /enabled\s*=\s*(true|false)/,
      `enabled = ${enabled}`
    )
    await fs.writeFile(filePath, updated, 'utf-8')
  }

  /**
   * Install git pre-commit hook
   */
  async installGitPreCommit(): Promise<void> {
    const gitHooksDir = path.join(this.workspaceRoot, '.git', 'hooks')
    const preCommitPath = path.join(gitHooksDir, 'pre-commit')
    
    const script = `#!/bin/sh
# Loom pre-commit hook — auto-generated
# This script triggers Loom hooks for gitPreCommit event

# Check if loom CLI is available
if command -v loom >/dev/null 2>&1; then
    # Trigger Loom gitPreCommit hooks
    loom hook trigger gitPreCommit --blocking
    
    # Check exit code
    if [ $? -ne 0 ]; then
        echo "Loom pre-commit hooks blocked this commit"
        exit 1
    fi
fi

# Allow commit to proceed
exit 0
`

    await fs.mkdir(gitHooksDir, { recursive: true })
    await fs.writeFile(preCommitPath, script, 'utf-8')
    
    // Make executable on Unix
    if (process.platform !== 'win32') {
      await fs.chmod(preCommitPath, 0o755)
    }
  }
}
