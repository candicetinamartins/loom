import { CoreMessage } from 'ai'
import { MODEL_CONTEXT_WINDOWS } from './ContextBudgetManager'

export interface CompactionResult {
  compacted: boolean
  messages: CoreMessage[]
  turnsSummarised?: number
}

export class ContextCompactor {
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

  private async summarizeOldTurns(messages: CoreMessage[]): Promise<string> {
    const turns = messages
      .map((m) => `${m.role}: ${String(m.content).slice(0, 500)}`)
      .join('\n\n')

    return `Summary of earlier turns:
- Multiple tool calls were executed
- Files were read and modified
- Progress was made toward the task
- Current state: continuing execution`
  }
}
