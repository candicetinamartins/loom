/**
 * Thinking budgets for each agent (per token optimization plan)
 * 0 = thinking disabled (for fast/simple agents)
 */
export const THINKING_BUDGETS: Record<string, number> = {
  orchestrator: 8000,  // deep task decomposition
  architect: 6000,     // design decisions
  engineer: 3000,      // implementation choices
  security: 3000,      // vulnerability analysis
  reviewer: 2000,      // code review
  devops: 2000,
  data: 2000,
  debugger: 4000,      // root cause analysis benefits from deep reasoning
  qa: 1000,
  documentarian: 500,
  researcher: 1000,
  explorer: 0,         // read-only navigation — no deep reasoning needed
}

/**
 * Silent agent protocol — mandatory for all agents
 * This is appended to every system prompt
 */
export const SILENT_AGENT_PROTOCOL = `
## Output Protocol (MANDATORY — do not deviate)

You are a silent execution agent. Your output goes directly to files and structured results — no human reads your intermediate text.

Rules:
1. Between tool calls: emit nothing. No narration, no explanation, no summaries.
2. Do not announce what you are about to do.
3. Do not summarize what you just did.
4. Do not explain your reasoning in output text — reasoning goes in thinking blocks.
5. Emit text ONLY inside the final [RESULT] block.
6. [RESULT] must be the last thing you emit. Nothing after it.

Correct turn:
  [tool call]
  [tool call]
  [tool call]
  [RESULT]...[END]

Incorrect turn:
  "Let me read the file first..."
  [tool call]
  "I can see that..."
  [tool call]
  "I've completed the implementation..."

[RESULT] format:
status = "complete" | "partial" | "failed"
summary = "<one sentence max 200 chars>"
files_created = ["path"]
files_modified = ["path"]
key_findings = ["finding"]
next_actions = ["action for downstream agent"]
[END]
`.trim()
