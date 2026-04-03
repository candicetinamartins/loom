import { injectable, inject } from 'inversify'
import { LoomMsgHub, Channel } from '../orchestration/LoomMsgHub'
import { TokenUsageTracker } from './TokenUsageTracker'
import { ContextCompactor } from '../context/ContextCompactor'
import {
  AgentResult,
  AgentCompletePayload,
  tryDirectParse,
  validateSilentProtocol,
  buildSystemPromptWithProtocol,
} from './AgentResultSchema'

export interface Tool {
  name: string
  execute: (args: any) => Promise<any>
}

export interface AgentDefinition {
  name: string
  model: string
  thinkingBudget?: number
  maxSteps?: number
  toolGroups: string[]
}

export interface StreamChunk {
  type: 'thinking' | 'text-delta' | 'tool-call' | 'finish'
  thinking?: string
  textDelta?: string
  toolName?: string
  args?: any
}

/**
 * AgentSession - Core agent execution with token optimization
 * 
 * This is the heart of Phase 2C's silent protocol and 78% token reduction:
 * - Only tool calls and [RESULT] blocks flow to the hub
 * - Thinking blocks are discarded
 * - Narration before [RESULT] is discarded
 * - Extended thinking for Claude models (cheaper than output tokens)
 * - Context compaction at 70% threshold
 * - Protocol violation tracking
 */
@injectable()
export class AgentSession {
  private inResultBlock = false
  private accumulated = ''
  private stepCount = 0
  private protocolViolations = 0
  private hasNarration = false
  private wastedNarrationChars = 0
  private resultExtracted = false

  constructor(
    @inject('AgentDefinition') private agentDef: AgentDefinition,
    @inject('SessionId') private sessionId: string,
    @inject(LoomMsgHub) private hub: LoomMsgHub,
    @inject(TokenUsageTracker) private tracker: TokenUsageTracker,
    @inject(ContextCompactor) private compactor: ContextCompactor,
  ) {}

  /**
   * Main LLM execution method with stream filtering
   */
  async executeLLM(
    baseSystemPrompt: string,
    messages: CoreMessage[],
    tools: Record<string, Tool>,
    signal?: AbortSignal,
  ): Promise<AgentCompletePayload> {
    // Build system prompt with mandatory silent protocol
    const systemPrompt = buildSystemPromptWithProtocol(
      baseSystemPrompt,
      this.agentDef.name,
      this.agentDef.thinkingBudget,
    )

    // Check if we need to compact context
    if (await this.compactor.isApproachingLimit(messages, this.agentDef.model)) {
      const compaction = await this.compactor.compact(messages, 0.70, this.agentDef.model)
      if (compaction.compacted) {
        messages = compaction.messages
        await this.publishCompactionBadge(compaction.turnsSummarised || 0)
      }
    }

    // Build stream options with extended thinking for Claude models
    const streamOptions = this.buildStreamTextOptions(systemPrompt, messages, tools)

    // Start tracking
    this.tracker.startTracking(this.agentDef.name)

    // Execute streaming LLM call
    const response = await this.streamLLM(streamOptions, signal)

    // Process stream chunks
    for await (const chunk of response) {
      await this.processChunk(chunk)
    }

    // Validate silent protocol
    const validation = validateSilentProtocol(this.accumulated, this.inResultBlock)
    this.protocolViolations = validation.violations
    this.hasNarration = validation.hasNarration

    // Extract result (fast path or fallback)
    const result = await this.extractResult()

    // Record metrics
    const usage = await this.getUsageFromResponse(response)
    this.tracker.recordTurn(this.agentDef.name, usage, this.protocolViolations, this.hasNarration)

    return {
      ...result,
      agentName: this.agentDef.name,
      stepCount: this.stepCount,
      tokenUsage: usage,
      protocolViolations: this.protocolViolations,
    }
  }

  /**
   * Process each stream chunk based on type
   */
  private async processChunk(chunk: StreamChunk): Promise<void> {
    switch (chunk.type) {
      case 'thinking':
        // Thinking blocks are internal reasoning, never forwarded
        // Debug only: LOOM_TRACE_THINKING=1 prints first 200 chars
        if (process.env.LOOM_TRACE_THINKING === '1' && chunk.thinking) {
          console.debug(`[thinking:${this.agentDef.name}]`, chunk.thinking.slice(0, 200))
        }
        break

      case 'text-delta':
        if (!chunk.textDelta) break
        
        this.accumulated += chunk.textDelta

        // Text only flows downstream once [RESULT] appears
        // Everything before [RESULT] is narration — discarded
        if (!this.inResultBlock && chunk.textDelta.includes('[RESULT]')) {
          this.inResultBlock = true
          
          // Calculate wasted narration before [RESULT]
          const beforeResult = this.accumulated.split('[RESULT]')[0]
          this.wastedNarrationChars = beforeResult.length
        }

        if (this.inResultBlock) {
          // Publish partial result to hub for Agent Panel display
          await this.hub.publish(
            LoomMsgHub.msg(Channel.RESULT_PARTIAL, {
              sessionId: this.sessionId,
              agentName: this.agentDef.name,
              payload: {
                token: chunk.textDelta,
                accumulated: this.accumulated.slice(-500), // Last 500 chars
              },
            })
          )
        }
        break

      case 'tool-call':
        // Tool calls always flow to hub — shown as steps in Agent Panel
        this.stepCount++
        await this.hub.publish(
          LoomMsgHub.msg(Channel.AGENT_PROGRESS, {
            sessionId: this.sessionId,
            agentName: this.agentDef.name,
            payload: {
              step: this.stepCount,
              maxSteps: this.agentDef.maxSteps ?? 20,
              currentAction: `${chunk.toolName}(${this.summariseArgs(chunk.args)})`,
              tokensUsed: 0, // Updated later
              costUsd: 0, // Updated later
            },
          })
        )
        break

      case 'finish':
        // Stream complete — validation happens in executeLLM
        break
    }
  }

  /**
   * Extract result from accumulated text
   * Fast path: tryDirectParse for well-formed [RESULT] blocks
   * Fallback: generateObject with Haiku for malformed output
   */
  private async extractResult(): Promise<AgentResult> {
    // Fast path: Direct parsing
    const directResult = tryDirectParse(this.accumulated)
    if (directResult) {
      this.resultExtracted = true
      return directResult
    }

    // Fallback: Use generateObject with Haiku to extract structure
    // This indicates protocol violation — agent didn't follow [RESULT] format
    console.warn(`[AgentSession:${this.agentDef.name}] Fallback extraction triggered — protocol violation`)
    
    // Use LLM to extract structure from malformed output
    const extractionPrompt = `
Extract the following fields from this agent output into valid JSON:

Agent Output:
${this.accumulated.slice(-2000)}  // Last 2000 chars

Fields to extract:
- status: "complete" | "partial" | "blocked" | "needs_input"
- summary: string (1-2 sentences)
- files_created: string[] (array of file paths)
- files_modified: string[] (array of file paths)
- key_findings: string[] (array of findings)
- next_actions: string[] (array of action items)

Return ONLY valid JSON matching this structure. No markdown, no explanation.`

    try {
      // Call LLM (Haiku for cost efficiency) to extract structured data
      const extracted = await this.callLLMForExtraction(extractionPrompt)
      const parsed = JSON.parse(extracted)
      
      return {
        status: parsed.status || 'partial',
        summary: parsed.summary || '[EXTRACTION_FALLBACK] Result extracted from malformed output',
        files_created: parsed.files_created || [],
        files_modified: parsed.files_modified || [],
        key_findings: parsed.key_findings?.length > 0 
          ? parsed.key_findings 
          : ['Agent output did not follow [RESULT] protocol — manual review recommended'],
        next_actions: parsed.next_actions || ['Review agent output for protocol compliance'],
      }
    } catch (error) {
      console.error('[AgentSession] Extraction fallback failed:', error)
      return {
        status: 'partial',
        summary: '[EXTRACTION_FALLBACK] Result extracted from malformed output',
        files_created: [],
        files_modified: [],
        key_findings: ['Agent output did not follow [RESULT] protocol — manual review recommended'],
        next_actions: ['Review agent output for protocol compliance'],
      }
    }
  }

  /**
   * Call LLM for extraction fallback (uses Haiku for cost efficiency)
   */
  private async callLLMForExtraction(prompt: string): Promise<string> {
    // Use anthropic-haiku or gpt-4o-mini for cheap extraction
    // This is a simplified implementation - real one would use Theia AI or Vercel SDK
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`)
    }
    
    const data = await response.json()
    return data.content?.[0]?.text || '{}'
  }

  /**
   * Build stream options with extended thinking for Claude models
   */
  private buildStreamTextOptions(
    systemPrompt: string,
    messages: CoreMessage[],
    tools: Record<string, Tool>,
  ): any {
    const isClaude = this.agentDef.model.includes('claude')
    const thinkingBudget = this.agentDef.thinkingBudget ?? 0

    return {
      model: this.agentDef.model,
      system: systemPrompt,
      messages,
      tools: Object.values(tools),
      // Extended thinking for Claude models
      ...(isClaude && thinkingBudget > 0 && {
        thinking: {
          type: 'extended',
          budget_tokens: thinkingBudget,
        },
        temperature: 1.0, // Required for extended thinking
      }),
      // Standard config for other models
      ...(!isClaude && {
        temperature: 0.7,
      }),
    }
  }

  /**
   * Stream LLM with proper typing using Vercel AI SDK pattern
   */
  private async *streamLLM(options: any, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    // Real implementation using fetch to LLM API with streaming
    // This follows the Vercel AI SDK pattern but implemented directly
    
    const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY
    const isClaude = options.model?.includes('claude')
    
    if (!apiKey) {
      throw new Error('No API key configured for LLM')
    }
    
    const apiUrl = isClaude 
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions'
    
    const requestBody = isClaude ? {
      model: options.model,
      max_tokens: 4096,
      system: options.system,
      messages: options.messages,
      stream: true,
      ...(options.thinking && {
        thinking: options.thinking,
      }),
    } : {
      model: options.model,
      messages: [
        { role: 'system', content: options.system },
        ...options.messages,
      ],
      stream: true,
      temperature: options.temperature,
    }
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(isClaude 
          ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
          : { 'Authorization': `Bearer ${apiKey}` }
        ),
      },
      body: JSON.stringify(requestBody),
      signal,
    })
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`)
    }
    
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body from LLM')
    }
    
    const decoder = new TextDecoder()
    let buffer = ''
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        
        for (const line of lines) {
          if (!line.trim() || line.startsWith(':')) continue
          
          try {
            const json = line.replace(/^data: /, '')
            if (json === '[DONE]') continue
            
            const data = JSON.parse(json)
            
            if (isClaude) {
              // Parse Claude streaming format
              if (data.type === 'content_block_delta') {
                if (data.delta?.thinking) {
                  yield { type: 'thinking', thinking: data.delta.thinking }
                } else if (data.delta?.text) {
                  yield { type: 'text-delta', textDelta: data.delta.text }
                }
              } else if (data.type === 'tool_use') {
                yield { 
                  type: 'tool-call', 
                  toolName: data.name,
                  args: data.input,
                }
              }
            } else {
              // Parse OpenAI streaming format
              const delta = data.choices?.[0]?.delta
              if (delta?.content) {
                yield { type: 'text-delta', textDelta: delta.content }
              }
              if (data.choices?.[0]?.finish_reason) {
                yield { type: 'finish' }
              }
            }
          } catch (e) {
            // Skip malformed JSON lines
          }
        }
      }
      
      yield { type: 'finish' }
    } finally {
      reader.releaseLock()
    }
  }

  private async getUsageFromResponse(response: any): Promise<{ input: number; output: number; total: number }> {
    // Extract usage from response metadata if available
    // Response is the stream generator, so we track tokens during streaming
    // For now, estimate based on accumulated text
    
    const outputTokens = Math.ceil(this.accumulated.length / 4)  // ~4 chars per token
    const inputTokens = Math.ceil(JSON.stringify(response).length / 4)
    
    // More accurate extraction would come from API response headers
    // X-Consumed-Tokens for Anthropic, usage field for OpenAI
    
    return { 
      input: inputTokens, 
      output: outputTokens, 
      total: inputTokens + outputTokens 
    }
  }

  private async publishCompactionBadge(turnsSummarised: number): Promise<void> {
    await this.hub.publish(
      LoomMsgHub.msg(Channel.AGENT_PROGRESS, {
        sessionId: this.sessionId,
        agentName: this.agentDef.name,
        payload: {
          step: this.stepCount,
          currentAction: `↺ compacted ${turnsSummarised} turns`,
          tokensUsed: 0,
          costUsd: 0,
        },
      })
    )
  }

  private summariseArgs(args: any): string {
    if (!args) return ''
    const keys = Object.keys(args)
    if (keys.length === 0) return ''
    if (keys.length === 1) return `${keys[0]}=${JSON.stringify(args[keys[0]]).slice(0, 20)}`
    return `${keys.length} args`
  }
}

// Type placeholder for CoreMessage
interface CoreMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
