import { injectable, inject, optional } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'
import { IProblemManager, TOOL_TYPES } from '../../tools/LspDiagnosticsTool'

@injectable()
export class ProblemsContextProvider implements ContextProvider {
  readonly type = 'problems'
  readonly prefix = 'problems'

  constructor(
    @inject(TOOL_TYPES.ProblemManager) @optional() private problemManager?: IProblemManager
  ) {}

  async provideContext(_mention: string): Promise<MentionContext> {
    if (!this.problemManager) {
      return {
        type: this.type,
        content: 'ProblemManager not available.',
        tokens: 10,
      }
    }

    try {
      // Get diagnostics for the active file or workspace
      // This is a simplified version - could be enhanced to track active file
      const content = 'Active problems/diagnostics available via @problems mention. Use @file:path for specific file diagnostics.'
      
      return {
        type: this.type,
        content,
        tokens: Math.ceil(content.length / 4),
      }
    } catch (error) {
      return {
        type: this.type,
        content: `Error accessing problems: ${error}`,
        tokens: 15,
      }
    }
  }
}
