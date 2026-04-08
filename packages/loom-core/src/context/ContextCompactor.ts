import { injectable, inject, optional } from 'inversify'
import { CoreMessage } from 'ai'
import { MODEL_CONTEXT_WINDOWS } from './ContextBudgetManager'
import type { SAIAProvider } from '../services/SAIAProvider'
import { TYPES } from '../loom-core-module'

export interface CompactionResult {
  compacted: boolean
  messages: CoreMessage[]
  turnsSummarised?: number
}

/**
 * ContextCompactor — Token-saving strategy via LLM summarization
 *
 * When context approaches 70% of model limit:
 * 1. Keeps last 10 messages (recent context)
 * 2. Uses LLM (Haiku-4-5 for cost efficiency) to summarize older turns
 * 3. Replaces old turns with compact summary
 *
 * This saves ~60-80% of tokens for long conversations vs keeping full history.
 */
@injectable()
export class ContextCompactor {
  constructor(
    @inject(TYPES.SAIAProvider) @optional() private saiaProvider?: SAIAProvider,
  ) {}

  async isApproachingLimit(messages: CoreMessage[], model: string): Promise<boolean> {
    const used = await this.estimateTokens(messages)
    const max = MODEL_CONTEXT_WINDOWS[model] ?? 200_000
    return used / max > 0.70
  }

  async compact(
    messages: CoreMessage[],
    threshold: number = 0.70,
    model: string,
  ): Promise<CompactionResult> {
    const used = await this.estimateTokens(messages)
    const max = MODEL_CONTEXT_WINDOWS[model] ?? 200_000

    if (used / max < threshold) {
      return { compacted: false, messages }
    }

    const systemMsg = messages.filter((m) => m.role === 'system')
    const recentMsgs = messages.slice(-10)
    const oldMsgs = messages.slice(0, -10).filter((m) => m.role !== 'system')

    if (oldMsgs.length === 0) {
      return { compacted: false, messages }
    }

    // Use LLM to summarize old turns (or fallback to static)
    const summary = await this.summarizeOldTurns(oldMsgs)

    const compactedHistory: CoreMessage[] = [
      ...systemMsg,
      {
        role: 'user',
        content: `[COMPACTED HISTORY — ${oldMsgs.length} earlier turns summarised]\n${summary}`,
      },
      ...recentMsgs,
    ]

    return {
      compacted: true,
      messages: compactedHistory,
      turnsSummarised: oldMsgs.length,
    }
  }

  private async estimateTokens(messages: CoreMessage[]): Promise<number> {
    let total = 0
    for (const msg of messages) {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      total += Math.ceil(content.length / 4)
    }
    return total
  }

  /**
   * Summarize old conversation turns using LLM (Haiku for cost efficiency).
   * Falls back to static summary if LLM unavailable.
   */
  private async summarizeOldTurns(messages: CoreMessage[]): Promise<string> {
    if (!this.saiaProvider || messages.length === 0) {
      return this.fallbackSummary()
    }

    const turns = messages
      .map((m) => `${m.role}: ${String(m.content).slice(0, 800)}`)
      .join('\n\n')

    const summaryPrompt = `Summarize these agent conversation turns into a compact context summary.
Focus on: key decisions made, files modified, tools used, current task state, blockers encountered.

Conversation turns:
${turns}

Provide a concise 3-5 bullet point summary. Be specific about file paths and actions taken.`

    try {
      // Use Haiku for cheap summarization (~1/10th cost of Sonnet)
      const result = await this.saiaProvider.chatCompletion({
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: summaryPrompt }],
        temperature: 0.3,
        max_tokens: 1024,
      })

      const summary = result.choices?.[0]?.message?.content?.trim()
      if (summary && summary.length > 20) {
        return summary
      }
    } catch (error) {
      console.warn('[ContextCompactor] LLM summarization failed, using fallback:', error)
    }

    return this.fallbackSummary()
  }

  private fallbackSummary(): string {
    return `Summary of earlier turns:
- Multiple tool calls were executed
- Files were read and modified
- Progress was made toward the task
- Current state: continuing execution`
  }
}
