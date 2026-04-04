import { injectable, inject } from 'inversify'
import { LoomMsgHub, Channel } from '../orchestration/LoomMsgHub'

/**
 * Phase 7 — DAP (Debug Adapter Protocol) Integration
 * 
 * Theia already ships full DAP support. These tools invoke Theia's 
 * existing DAP session APIs for the debugger agent.
 * 
 * Loom breakpoints shown as ◈ in --loom-accent color
 * (distinct from standard red dots)
 */

export interface DebugBreakpoint {
  id: number
  file: string
  line: number
  condition?: string
  enabled: boolean
}

export interface DebugVariable {
  name: string
  type: string
  value: string
  variablesReference?: number
}

export interface DebugStackFrame {
  id: number
  name: string
  source?: string
  line: number
  column: number
}

@injectable()
export class DapService {
  private breakpoints: Map<string, DebugBreakpoint[]> = new Map()
  private activeSession: string | null = null
  private sessionApproval: boolean = false

  constructor(
    @inject(LoomMsgHub) private hub: LoomMsgHub,
    @inject('TheiaDebugService') private theiaDebug: any,
  ) {}

  /**
   * debug_set_breakpoint: Set a breakpoint with optional condition
   */
  async setBreakpoint(args: {
    file: string
    line: number
    condition?: string
  }): Promise<{ success: boolean; breakpointId: number }> {
    const { file, line, condition } = args
    
    const bp: DebugBreakpoint = {
      id: Date.now(),
      file,
      line,
      condition,
      enabled: true,
    }

    // Store in local map
    const fileBps = this.breakpoints.get(file) || []
    fileBps.push(bp)
    this.breakpoints.set(file, fileBps)

    // Send to Theia DAP
    try {
      await this.theiaDebug.addBreakpoint({
        path: file,
        line,
        condition,
        // Loom accent marker
        presentation: {
          icon: '◈',
          color: 'var(--loom-accent)',
        },
      })

      await this.hub.publish(
        LoomMsgHub.msg(Channel.DEBUG_BREAKPOINT_SET, {
          breakpointId: bp.id,
          file,
          line,
        })
      )

      return { success: true, breakpointId: bp.id }
    } catch (error) {
      console.error('[DapService] Failed to set breakpoint:', error)
      return { success: false, breakpointId: -1 }
    }
  }

  /**
   * debug_start_session: Start debugging session (requires approval)
   */
  async startSession(args: {
    program: string
    args?: string[]
    cwd?: string
    runtime?: 'node' | 'python' | 'java'
  }): Promise<{ success: boolean; sessionId: string | null; requiresApproval: boolean }> {
    const { program, args: programArgs = [], cwd, runtime = 'node' } = args

    // Check if approval is needed
    if (!this.sessionApproval) {
      await this.hub.publish(
        LoomMsgHub.msg(Channel.DEBUG_SESSION_REQUEST, {
          program,
          args,
          runtime,
        })
      )

      return {
        success: false,
        sessionId: null,
        requiresApproval: true,
      }
    }

    try {
      const sessionId = `debug-${Date.now()}`
      
      await this.theiaDebug.start({
        type: runtime,
        request: 'launch',
        program,
        args: programArgs,
        cwd,
      })

      this.activeSession = sessionId

      await this.hub.publish(
        LoomMsgHub.msg(Channel.DEBUG_SESSION_STARTED, {
          sessionId,
          program,
          runtime,
        })
      )

      return { success: true, sessionId, requiresApproval: false }
    } catch (error) {
      console.error('[DapService] Failed to start debug session:', error)
      return { success: false, sessionId: null, requiresApproval: false }
    }
  }

  /**
   * Approve debug session start
   */
  approveSession(): void {
    this.sessionApproval = true
  }

  /**
   * debug_read_variables: Read variables from current scope
   */
  async readVariables(args: {
    scope?: 'local' | 'global' | 'all'
    variablesReference?: number
  }): Promise<{ success: boolean; variables: DebugVariable[] }> {
    const { scope = 'local', variablesReference } = args

    if (!this.activeSession) {
      return { success: false, variables: [] }
    }

    try {
      const scopes = await this.theiaDebug.getScopes()
      let variables: DebugVariable[] = []

      for (const s of scopes) {
        if (scope === 'all' || s.name.toLowerCase() === scope) {
          const vars = await this.theiaDebug.getVariables(
            variablesReference || s.variablesReference
          )
          variables = variables.concat(
            vars.map((v: any) => ({
              name: v.name,
              type: v.type,
              value: v.value,
              variablesReference: v.variablesReference,
            }))
          )
        }
      }

      return { success: true, variables }
    } catch (error) {
      console.error('[DapService] Failed to read variables:', error)
      return { success: false, variables: [] }
    }
  }

  /**
   * debug_step: Step through code (over/into/out)
   */
  async step(args: {
    action: 'over' | 'into' | 'out' | 'continue'
  }): Promise<{ success: boolean; currentLine?: number; currentFile?: string }> {
    const { action } = args

    if (!this.activeSession) {
      return { success: false }
    }

    try {
      let result: any

      switch (action) {
        case 'over':
          result = await this.theiaDebug.stepOver()
          break
        case 'into':
          result = await this.theiaDebug.stepIn()
          break
        case 'out':
          result = await this.theiaDebug.stepOut()
          break
        case 'continue':
          result = await this.theiaDebug.continue()
          break
      }

      const stackFrame = await this.getCurrentStackFrame()

      await this.hub.publish(
        LoomMsgHub.msg(Channel.DEBUG_STEPPED, {
          action,
          line: stackFrame?.line,
          file: stackFrame?.source,
        })
      )

      return {
        success: true,
        currentLine: stackFrame?.line,
        currentFile: stackFrame?.source,
      }
    } catch (error) {
      console.error('[DapService] Step failed:', error)
      return { success: false }
    }
  }

  /**
   * debug_evaluate: Evaluate expression in current context
   */
  async evaluate(args: {
    expression: string
    context?: 'watch' | 'repl' | 'hover'
  }): Promise<{ success: boolean; result?: string; type?: string; error?: string }> {
    const { expression, context = 'repl' } = args

    if (!this.activeSession) {
      return { success: false, error: 'No active debug session' }
    }

    try {
      const result = await this.theiaDebug.evaluate(expression, context)

      await this.hub.publish(
        LoomMsgHub.msg(Channel.DEBUG_EVALUATED, {
          expression,
          result: result.result,
          type: result.type,
        })
      )

      return {
        success: true,
        result: result.result,
        type: result.type,
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return { success: false, error: errorMsg }
    }
  }

  /**
   * Get current stack frame
   */
  private async getCurrentStackFrame(): Promise<DebugStackFrame | null> {
    try {
      const frames = await this.theiaDebug.getStackTrace()
      if (frames && frames.length > 0) {
        const top = frames[0]
        return {
          id: top.id,
          name: top.name,
          source: top.source?.path,
          line: top.line,
          column: top.column,
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Stop debug session
   */
  async stopSession(): Promise<void> {
    if (this.activeSession) {
      try {
        await this.theiaDebug.stop()
        this.activeSession = null
        this.sessionApproval = false
      } catch (error) {
        console.error('[DapService] Failed to stop session:', error)
      }
    }
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints(): DebugBreakpoint[] {
    const all: DebugBreakpoint[] = []
    for (const bps of this.breakpoints.values()) {
      all.push(...bps)
    }
    return all
  }

  /**
   * Remove breakpoint
   */
  async removeBreakpoint(breakpointId: number): Promise<boolean> {
    for (const [file, bps] of this.breakpoints) {
      const idx = bps.findIndex(bp => bp.id === breakpointId)
      if (idx >= 0) {
        const bp = bps[idx]
        bps.splice(idx, 1)
        
        try {
          await this.theiaDebug.removeBreakpoint({
            path: bp.file,
            line: bp.line,
          })
          return true
        } catch {
          return false
        }
      }
    }
    return false
  }
}

// Extend ChannelMap for debug events
declare module '../orchestration/LoomMsgHub' {
  interface ChannelMap {
    DEBUG_BREAKPOINT_SET: { breakpointId: number; file: string; line: number }
    DEBUG_SESSION_REQUEST: { program: string; args: string[]; runtime: string }
    DEBUG_SESSION_STARTED: { sessionId: string; program: string; runtime: string }
    DEBUG_STEPPED: { action: string; line?: number; file?: string }
    DEBUG_EVALUATED: { expression: string; result: string; type: string }
  }
}
