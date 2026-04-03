import { z } from 'zod'

/**
 * AgentResultSchema - Zod schema for structured agent results
 * 
 * This enforces the [RESULT] block format that agents must emit.
 * Used for both direct parsing (fast path) and generateObject fallback.
 */

export const AgentResultSchema = z.object({
  status: z.enum(['complete', 'partial', 'failed']),
  summary: z.string().max(200),
  files_created: z.array(z.string()).default([]),
  files_modified: z.array(z.string()).default([]),
  key_findings: z.array(z.string().max(120)).max(5).default([]),
  next_actions: z.array(z.string().max(120)).max(5).default([]),
})

export type AgentResult = z.infer<typeof AgentResultSchema>

export interface AgentCompletePayload extends AgentResult {
  agentName: string
  stepCount: number
  tokenUsage: {
    input: number
    output: number
    total: number
  }
  thinkingTokens?: number
  protocolViolations?: number
  costUsd?: number
}

/**
 * tryDirectParse - Fast path for well-formed [RESULT] blocks
 * 
 * Extracts the content between [RESULT] and [END] markers and parses as JSON/TOML-like format.
 * Returns null if parsing fails, triggering the generateObject fallback.
 */
export function tryDirectParse(accumulatedText: string): AgentResult | null {
  // Extract content between [RESULT] and [END]
  const resultMatch = accumulatedText.match(/\[RESULT\]([\s\S]*?)\[END\]/)
  if (!resultMatch) {
    return null
  }

  const content = resultMatch[1].trim()

  try {
    // Try JSON parsing first
    if (content.startsWith('{')) {
      const parsed = JSON.parse(content)
      const validated = AgentResultSchema.safeParse(parsed)
      if (validated.success) {
        return validated.data
      }
      return null
    }

    // Try TOML-like key=value format
    const result: Record<string, any> = {}
    const lines = content.split('\n')
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      
      // Match key = value or key = [array]
      const match = trimmed.match(/^([a-z_]+)\s*=\s*(.+)$/)
      if (match) {
        const [, key, valueStr] = match
        
        // Parse array values
        if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
          const arrayContent = valueStr.slice(1, -1)
          result[key] = arrayContent
            .split(',')
            .map(s => s.trim().replace(/^["']|["']$/g, ''))
            .filter(s => s)
        } else if (valueStr === 'true') {
          result[key] = true
        } else if (valueStr === 'false') {
          result[key] = false
        } else {
          result[key] = valueStr.replace(/^["']|["']$/g, '')
        }
      }
    }

    const validated = AgentResultSchema.safeParse(result)
    if (validated.success) {
      return validated.data
    }
    
    return null
  } catch {
    return null
  }
}

/**
 * validateSilentProtocol - Check for protocol violations in agent output
 * 
 * Returns count of violations and whether narration was detected.
 */
export function validateSilentProtocol(
  accumulatedText: string,
  hasResultBlock: boolean
): { violations: number; hasNarration: boolean } {
  let violations = 0
  let hasNarration = false

  // Check if there's text before [RESULT] (narration)
  if (hasResultBlock) {
    const beforeResult = accumulatedText.split('[RESULT]')[0].trim()
    if (beforeResult.length > 50) {
      hasNarration = true
      violations++
    }
  }

  // Check for common narration phrases
  const narrationPhrases = [
    "i'll",
    "i will",
    "let me",
    "i'll now",
    "i need to",
    "first,",
    "next,",
    "now i'll",
    "i'm going to",
    "i am going to",
    "step 1",
    "step 2",
    "great!",
    "done!",
    "finished!",
    "completed!",
    "there we go",
    "okay",
    "so,",
  ]
  
  const lowerText = accumulatedText.toLowerCase()
  for (const phrase of narrationPhrases) {
    if (lowerText.includes(phrase)) {
      hasNarration = true
      violations++
      break // Count once for narration
    }
  }

  // Check if [RESULT] block is missing
  if (!hasResultBlock) {
    violations++
  }

  return { violations, hasNarration }
}

/**
 * buildSystemPromptWithProtocol - Add mandatory silent protocol to agent prompts
 */
export function buildSystemPromptWithProtocol(
  basePrompt: string,
  agentName: string,
  thinkingBudget: number = 0
): string {
  const thinkingSection = thinkingBudget > 0
    ? `
## Extended Thinking

You have ${thinkingBudget} tokens of extended thinking available.
Use this for complex reasoning before emitting [RESULT].
Thinking blocks are internal and never shown to the user.
`
    : ''

  return `${basePrompt}

## Output Protocol (MANDATORY)

You are a silent execution agent. Your output goes directly to files.
No human reads your intermediate text.

RULES:
1. Between tool calls: emit NOTHING
2. Do NOT announce what you are about to do  
3. Do NOT summarize what you just did
4. Reasoning goes in thinking blocks, never in output text
5. Emit text ONLY inside the final [RESULT] block
6. [RESULT] must be the LAST thing you emit

${thinkingSection}

## Result Format

Emit exactly one [RESULT] block at the end:

[RESULT]
status = "complete" | "partial" | "failed"
summary = "<one sentence, max 200 chars>"
files_created = ["path/to/file"]
files_modified = ["path/to/file"]
key_findings = ["finding 1", "finding 2"]
next_actions = ["action for downstream agent"]
[END]

VIOLATIONS:
- Narration before [RESULT] costs real money at output token rates
- Each violation is tracked and affects your compliance rate
- Agents with <95% compliance get additional protocol reminders

[AGENT: ${agentName}]
`
}

/**
 * formatAgentResultForDisplay - Convert result to human-readable format
 */
export function formatAgentResultForDisplay(result: AgentCompletePayload): string {
  const lines = [
    `## ${result.agentName} Result`,
    '',
    `Status: ${result.status}`,
    `Summary: ${result.summary}`,
    '',
  ]

  if (result.files_created.length > 0) {
    lines.push('Files created:')
    result.files_created.forEach(f => lines.push(`  - ${f}`))
    lines.push('')
  }

  if (result.files_modified.length > 0) {
    lines.push('Files modified:')
    result.files_modified.forEach(f => lines.push(`  - ${f}`))
    lines.push('')
  }

  if (result.key_findings.length > 0) {
    lines.push('Key findings:')
    result.key_findings.forEach(f => lines.push(`  - ${f}`))
    lines.push('')
  }

  if (result.next_actions.length > 0) {
    lines.push('Next actions:')
    result.next_actions.forEach(a => lines.push(`  - ${a}`))
    lines.push('')
  }

  lines.push(`Steps: ${result.stepCount}`)
  lines.push(`Tokens: ${result.tokenUsage.total.toLocaleString()}`)
  if (result.costUsd) {
    lines.push(`Cost: $${result.costUsd.toFixed(4)}`)
  }

  return lines.join('\n')
}
