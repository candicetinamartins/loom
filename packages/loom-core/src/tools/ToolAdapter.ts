/**
 * ToolAdapter - Bridges loom-tools (Theia-style) with loom-core ToolProvider
 * 
 * Provides a simplified interface for adapting Theia AI tools to loom-core format.
 */

import { ToolDefinition, ToolGroupName, ToolGroups } from './ToolGroupRegistry'

// Simplified Theia-style interface (no external dependencies)
export interface TheiaToolRequest {
  id?: string
  name: string
  description: string
  parameters?: Record<string, any>
  handler: (argString: string, ctx?: any) => Promise<any>
}

export interface TheiaToolProvider {
  getTool(): TheiaToolRequest
}

/**
 * Adapter that wraps loom-tools (Theia-style) to work with loom-core
 */
export class TheiaToolAdapter {
  constructor(private theiaTool: TheiaToolProvider) {}

  adapt(name?: string): ToolDefinition {
    const theiaRequest = this.theiaTool.getTool()
    
    return {
      name: theiaRequest.name || name || 'unknown',
      description: theiaRequest.description || '',
      group: this.inferGroup(theiaRequest.name),
      estimatedTokens: 500,
      parameters: theiaRequest.parameters,
      execute: async (args: any): Promise<any> => {
        const argString = JSON.stringify(args)
        const result = await theiaRequest.handler(argString, undefined)
        return this.convertResult(result)
      }
    }
  }

  private inferGroup(toolName: string): ToolGroupName {
    const name = toolName.toLowerCase()
    if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('edit') || name.includes('dir')) {
      return ToolGroups.FILE_OPS
    }
    if (name.includes('git')) return ToolGroups.GIT
    if (name.includes('search') || name.includes('grep')) return ToolGroups.CODE_SEARCH
    if (name.includes('bash') || name.includes('shell')) return ToolGroups.SHELL
    if (name.includes('web') || name.includes('fetch')) return ToolGroups.WEB
    return ToolGroups.AGENT
  }

  private convertResult(result: any): any {
    if (typeof result === 'string') {
      return { result, success: true }
    }
    if (result && typeof result === 'object') {
      return {
        result: result.result || result,
        success: result.success !== false,
        error: result.error
      }
    }
    return { result, success: true }
  }
}

/**
 * Registry to manage Theia-style tool providers and adapt them
 */
export class AdaptedToolRegistry {
  private adaptedTools: Map<string, ToolDefinition> = new Map()

  registerTheiaTool(tool: TheiaToolProvider): void {
    const adapter = new TheiaToolAdapter(tool)
    const definition = adapter.adapt()
    this.adaptedTools.set(definition.name, definition)
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.adaptedTools.get(name)
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.adaptedTools.values())
  }
}

// Export singleton instance
export const adaptedToolRegistry = new AdaptedToolRegistry()
