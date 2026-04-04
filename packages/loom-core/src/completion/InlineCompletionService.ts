import { injectable, inject } from 'inversify'
import { GraphService } from '@loom/graph'

/**
 * Phase 7 — Inline Completion Integration
 * 
 * Extends Theia AI's code completion agent with graph-aware context.
 * Provides ghost text, Supercomplete, and Tab-to-Jump modes.
 * 
 * Uses function's Kuzu neighbourhood for context-aware suggestions.
 */

export interface InlineCompletionContext {
  filePath: string
  line: number
  column: number
  prefix: string
  suffix: string
  language: string
}

export interface InlineCompletion {
  text: string
  mode: 'ghost' | 'supercomplete' | 'tab-to-jump'
  confidence: number
  cursorOffset: number
  source: 'graph-context' | 'llm'
}

@injectable()
export class InlineCompletionService {
  constructor(
    @inject(GraphService) private readonly graphService: GraphService,
  ) {}

  /**
   * Get inline completions with graph-aware context
   */
  async getCompletions(context: InlineCompletionContext): Promise<InlineCompletion[]> {
    const completions: InlineCompletion[] = []

    // 1. Get graph context for the current function
    const graphContext = await this.getGraphContext(context)

    // 2. Generate ghost text completion (single line)
    const ghostCompletion = await this.generateGhostCompletion(context, graphContext)
    if (ghostCompletion) {
      completions.push(ghostCompletion)
    }

    // 3. Generate Supercomplete (multi-line intelligent completion)
    const supercomplete = await this.generateSupercomplete(context, graphContext)
    if (supercomplete) {
      completions.push(supercomplete)
    }

    // 4. Generate Tab-to-Jump (structural completion)
    const tabToJump = await this.generateTabToJump(context, graphContext)
    if (tabToJump) {
      completions.push(tabToJump)
    }

    return completions.sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Get graph context for current function
   */
  private async getGraphContext(context: InlineCompletionContext): Promise<string> {
    try {
      // Find the current function in the graph
      const result = await this.graphService.query(`
        MATCH (f:Function)
        WHERE f.file = '${context.filePath.replace(/'/g, "''")}'
        AND f.line <= ${context.line}
        AND f.endLine >= ${context.line}
        RETURN f
        LIMIT 1
      `)

      if (result.length === 0) return ''

      const func = result[0].f.properties || result[0].f

      // Get neighbourhood: callers, callees, and related types
      const neighbourhood = await this.graphService.query(`
        MATCH (f:Function {name: '${func.name.replace(/'/g, "''")}'})
        OPTIONAL MATCH (f)-[:CALLS]->(callee:Function)
        OPTIONAL MATCH (caller:Function)-[:CALLS]->(f)
        OPTIONAL MATCH (f)-[:USES]->(t:Type|Interface|Class)
        RETURN 
          collect(DISTINCT callee.name) as callees,
          collect(DISTINCT caller.name) as callers,
          collect(DISTINCT t.name) as types
      `)

      if (neighbourhood.length === 0) return ''

      const n = neighbourhood[0]
      const callees = n.callees?.filter(Boolean) || []
      const callers = n.callers?.filter(Boolean) || []
      const types = n.types?.filter(Boolean) || []

      let contextParts: string[] = []
      
      if (callers.length > 0) {
        contextParts.push(`Called by: ${callers.slice(0, 5).join(', ')}`)
      }
      if (callees.length > 0) {
        contextParts.push(`Calls: ${callees.slice(0, 5).join(', ')}`)
      }
      if (types.length > 0) {
        contextParts.push(`Uses types: ${types.slice(0, 3).join(', ')}`)
      }

      return contextParts.join('\n')
    } catch {
      return ''
    }
  }

  /**
   * Generate ghost text completion (single line, high confidence)
   */
  private async generateGhostCompletion(
    context: InlineCompletionContext,
    graphContext: string
  ): Promise<InlineCompletion | null> {
    // Simple pattern-based completion for common constructs
    const patterns: Array<{ regex: RegExp; completion: string; confidence: number }> = [
      { regex: /if\s*\([^)]+\)\s*\{$/, completion: '\n  \n}', confidence: 0.95 },
      { regex: /for\s*\([^)]+\)\s*\{$/, completion: '\n  \n}', confidence: 0.95 },
      { regex: /while\s*\([^)]+\)\s*\{$/, completion: '\n  \n}', confidence: 0.95 },
      { regex: /function\s+\w+\s*\([^)]*\)\s*\{$/, completion: '\n  \n}', confidence: 0.95 },
      { regex: /const\s+\w+\s*=\s*\[$/, completion: '\n  \n]', confidence: 0.90 },
      { regex: /const\s+\w+\s*=\s*\{$/, completion: '\n  \n}', confidence: 0.90 },
      { regex: /try\s*\{$/, completion: '\n  \n} catch (error) {\n  \n}', confidence: 0.92 },
    ]

    const trimmedPrefix = context.prefix.trim()
    
    for (const pattern of patterns) {
      if (pattern.regex.test(trimmedPrefix)) {
        return {
          text: pattern.completion,
          mode: 'ghost',
          confidence: pattern.confidence,
          cursorOffset: pattern.completion.indexOf('\n  ') + 3,
          source: 'graph-context',
        }
      }
    }

    // No pattern match - could call LLM here for intelligent completion
    return null
  }

  /**
   * Generate Supercomplete (multi-line intelligent completion)
   */
  private async generateSupercomplete(
    context: InlineCompletionContext,
    graphContext: string
  ): Promise<InlineCompletion | null> {
    // Check for method call patterns that we can expand
    const methodCallPattern = /(\w+)\.(\w+)\($/
    const match = context.prefix.match(methodCallPattern)
    
    if (match) {
      const [, obj, method] = match
      
      // Try to find method signature from graph
      try {
        const result = await this.graphService.query(`
          MATCH (f:Function {name: '${method.replace(/'/g, "''")}'})
          RETURN f.params as params
          LIMIT 1
        `)
        
        if (result.length > 0 && result[0].params) {
          const params = result[0].params
          return {
            text: `${params})`,
            mode: 'supercomplete',
            confidence: 0.85,
            cursorOffset: params.length + 1,
            source: 'graph-context',
          }
        }
      } catch {
        // Fall through to default
      }
    }

    // Variable declaration completion
    const varPattern = /const\s+(\w+)\s*=\s*$/
    const varMatch = context.prefix.match(varPattern)
    
    if (varMatch) {
      const varName = varMatch[1]
      
      // Try to infer type from usage
      const inferred = this.inferTypeFromUsage(varName, context.prefix)
      if (inferred) {
        return {
          text: `${inferred.initializer}`,
          mode: 'supercomplete',
          confidence: inferred.confidence,
          cursorOffset: inferred.cursorOffset,
          source: 'graph-context',
        }
      }
    }

    return null
  }

  /**
   * Generate Tab-to-Jump (structural completion with placeholders)
   */
  private async generateTabToJump(
    context: InlineCompletionContext,
    graphContext: string
  ): Promise<InlineCompletion | null> {
    // Check for common boilerplate patterns
    const patterns: Array<{ regex: RegExp; template: string; tabStops: number[]; confidence: number }> = [
      {
        regex: /\/\/\s*TODO:\s*error\s*handling/i,
        template: 'try {\n  $1\n} catch (error) {\n  console.error("$2:", error);\n  $3\n}',
        tabStops: [1, 2, 3],
        confidence: 0.88,
      },
      {
        regex: /\/\/\s*TODO:\s*test/i,
        template: 'describe("$1", () => {\n  it("should $2", () => {\n    $3\n  });\n});',
        tabStops: [1, 2, 3],
        confidence: 0.88,
      },
      {
        regex: /\/\/\s*TODO:\s*async/i,
        template: 'async function $1($2) {\n  $3\n}',
        tabStops: [1, 2, 3],
        confidence: 0.85,
      },
    ]

    for (const pattern of patterns) {
      if (pattern.regex.test(context.prefix)) {
        return {
          text: pattern.template,
          mode: 'tab-to-jump',
          confidence: pattern.confidence,
          cursorOffset: pattern.template.indexOf('$1') + 2,
          source: 'graph-context',
        }
      }
    }

    return null
  }

  /**
   * Infer type from variable usage patterns
   */
  private inferFromUsage(varName: string, code: string): { initializer: string; confidence: number; cursorOffset: number } | null {
    // Check for common naming conventions
    if (/^(is|has|should|can|will)/i.test(varName)) {
      return { initializer: 'false', confidence: 0.8, cursorOffset: 5 }
    }
    if (/^(count|index|num|size|length)/i.test(varName)) {
      return { initializer: '0', confidence: 0.75, cursorOffset: 1 }
    }
    if (/^(list|items|results|data)/i.test(varName)) {
      return { initializer: '[]', confidence: 0.7, cursorOffset: 1 }
    }
    if (/^(map|dict|obj|config)/i.test(varName)) {
      return { initializer: '{}', confidence: 0.7, cursorOffset: 1 }
    }
    if (/^(str|text|msg|name)/i.test(varName)) {
      return { initializer: '""', confidence: 0.7, cursorOffset: 1 }
    }

    return null
  }

  /**
   * Check if completion should be triggered
   */
  shouldTriggerCompletion(context: InlineCompletionContext): boolean {
    // Don't trigger in strings or comments
    const lastLines = context.prefix.split('\n').slice(-3)
    const lastLine = lastLines[lastLines.length - 1]
    
    // Check if in string
    const quoteCount = (lastLine.match(/"/g) || []).length
    if (quoteCount % 2 === 1) return false
    
    // Check if in comment
    if (lastLine.includes('//') && !lastLine.includes('TODO')) return false
    
    // Trigger on specific patterns
    const triggerPatterns = [
      /\{$/,
      /\[$/,
      /\($/,
      /\.$/,
      /=>\s*$/,
      /:\s*$/,
      /TODO:/,
    ]
    
    return triggerPatterns.some(p => p.test(lastLine))
  }

  private inferTypeFromUsage(varName: string, prefix: string): { initializer: string; confidence: number; cursorOffset: number } | null {
    return this.inferFromUsage(varName, prefix)
  }
}
