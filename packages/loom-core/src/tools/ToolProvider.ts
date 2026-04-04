/**
 * ToolProvider - Provides tool definitions for LLM service
 *
 * Wraps ToolGroupRegistry for LLM tool calls
 */

import { injectable, inject } from 'inversify'
import { ToolGroupRegistry, ToolDefinition, ToolGroupName } from './ToolGroupRegistry'

export interface ToolCallResult {
  success: boolean
  result: string
  error?: string
}

export interface Tool {
  name: string
  description: string
  handler: (args: any) => Promise<ToolCallResult>
}

export interface LoomTool {
  name: string
  description: string
  parameters: unknown
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

@injectable()
export class ToolProvider {
  constructor(
    @inject(ToolGroupRegistry) private registry: ToolGroupRegistry
  ) {}

  getTool(name: string): ToolDefinition | undefined {
    // Search all groups for the tool
    for (const group of this.registry.getAllGroups()) {
      const tool = group.tools.find(t => t.name === name)
      if (tool) return tool
    }
    return undefined
  }

  getTools(names: string[]): ToolDefinition[] {
    return names.map(name => this.getTool(name)).filter((t): t is ToolDefinition => t !== undefined)
  }

  getAllTools(): ToolDefinition[] {
    return this.registry.getAllTools()
  }
}
