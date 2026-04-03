import { injectable, inject } from 'inversify'
import { TOMLParser } from '@loom/core'
import { SpecService } from './SpecService'

/**
 * SpecMentionProvider - Handles @spec:name mentions in chat
 * 
 * When user types "@spec:user-auth", this provider:
 * 1. Resolves the spec name
 * 2. Loads the spec content
 * 3. Formats it for agent context injection
 */

@injectable()
export class SpecMentionProvider {
  private parser = new TOMLParser()

  constructor(
    @inject(SpecService) private specService: SpecService,
  ) {}

  /**
   * Check if this provider handles the mention type
   */
  handles(mentionType: string): boolean {
    return mentionType === 'spec'
  }

  /**
   * Resolve a @spec:name mention to formatted context
   */
  async resolve(mentionValue: string, budget: { task: number }): Promise<string | null> {
    const specName = mentionValue.trim()
    
    // Load the spec
    const spec = await this.specService.getSpec(specName)
    if (!spec) {
      return `[SPEC NOT FOUND: ${specName}]`
    }

    // Format for context injection
    const formatted = this.specService.formatForContext(spec)
    
    // Respect budget (truncate if necessary)
    const maxChars = Math.floor(budget.task * 4) // Approx 4 chars per token
    if (formatted.length > maxChars) {
      return formatted.slice(0, maxChars) + '\n... [truncated to fit context budget]'
    }
    
    return formatted
  }

  /**
   * Get list of available specs for autocomplete
   */
  async getCompletions(partial: string): Promise<Array<{ name: string; title: string }>> {
    const allSpecs = this.specService.getAllSpecs()
    
    return allSpecs
      .filter(spec => spec.manifest.name.toLowerCase().includes(partial.toLowerCase()))
      .map(spec => ({
        name: spec.manifest.name,
        title: spec.manifest.title,
      }))
  }
}
