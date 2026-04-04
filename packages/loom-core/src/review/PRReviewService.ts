import { injectable, inject } from 'inversify'
import * as http from 'http'
import * as crypto from 'crypto'
import { LoomMsgHub, Channel } from '../orchestration/LoomMsgHub'
import { PipelineRunner } from '../orchestration/PipelineRunner'

/**
 * Phase 8 — PR Review with GitHub Webhook
 * 
 * GitHub webhook → CLI agent reviews PRs.
 * 
 * Features:
 * - Receive GitHub webhook events
 * - Trigger security, engineer, qa agents on PR
 * - Post review comments back to GitHub
 * - Configurable review rules
 */

export interface GitHubWebhookPayload {
  action: string
  pull_request: {
    number: number
    title: string
    body: string
    head: {
      ref: string
      sha: string
    }
    base: {
      ref: string
    }
    user: {
      login: string
    }
    html_url: string
    diff_url: string
  }
  repository: {
    full_name: string
    clone_url: string
  }
}

export interface PRReviewConfig {
  enabled: boolean
  secret: string // Webhook secret for verification
  agents: string[] // Which agents to run
  rules: {
    maxFiles: number
    maxLinesChanged: number
    requireSecurityReview: boolean
    requireTests: boolean
  }
  comments: {
    postSummary: boolean
    postInline: boolean
  }
}

export interface PRReviewResult {
  prNumber: number
  repository: string
  agents: Array<{
    agentName: string
    status: 'passed' | 'failed' | 'warning'
    findings: string[]
    cost: number
  }>
  summary: string
  overallStatus: 'approved' | 'changes_requested' | 'comment'
}

@injectable()
export class PRReviewService {
  private config: PRReviewConfig
  private server: http.Server | null = null

  constructor(
    @inject(LoomMsgHub) private hub: LoomMsgHub,
    @inject(PipelineRunner) private pipelineRunner: PipelineRunner,
  ) {
    this.config = {
      enabled: false,
      secret: '',
      agents: ['security', 'engineer', 'qa'],
      rules: {
        maxFiles: 50,
        maxLinesChanged: 1000,
        requireSecurityReview: true,
        requireTests: true,
      },
      comments: {
        postSummary: true,
        postInline: false,
      },
    }
  }

  async initialize(config?: Partial<PRReviewConfig>): Promise<void> {
    if (config) {
      this.config = { ...this.config, ...config }
    }

    if (!this.config.enabled) {
      console.log('[PRReviewService] Disabled (no config)')
      return
    }

    console.log('[PRReviewService] Initialized')
  }

  /**
   * Start webhook server
   */
  async startServer(port: number = 3000): Promise<void> {
    if (this.server) {
      console.log('[PRReviewService] Server already running')
      return
    }

    this.server = http.createServer((req, res) => {
      this.handleWebhook(req, res)
    })

    return new Promise((resolve, reject) => {
      this.server!.listen(port, () => {
        console.log(`[PRReviewService] Webhook server running on port ${port}`)
        resolve()
      })
      this.server!.on('error', reject)
    })
  }

  /**
   * Handle GitHub webhook
   */
  private async handleWebhook(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Only accept POST to /webhook
    if (req.method !== 'POST' || req.url !== '/webhook') {
      res.writeHead(404)
      res.end()
      return
    }

    try {
      const signature = req.headers['x-hub-signature-256'] as string
      const event = req.headers['x-github-event'] as string
      
      const body = await this.readBody(req)

      // Verify signature
      if (this.config.secret && !this.verifySignature(body, signature)) {
        res.writeHead(401)
        res.end('Unauthorized')
        return
      }

      // Only handle pull_request events
      if (event !== 'pull_request') {
        res.writeHead(200)
        res.end('Ignored')
        return
      }

      const payload: GitHubWebhookPayload = JSON.parse(body)

      // Only handle opened, synchronize, reopened actions
      if (!['opened', 'synchronize', 'reopened'].includes(payload.action)) {
        res.writeHead(200)
        res.end('Ignored')
        return
      }

      // Process PR review
      res.writeHead(202)
      res.end('Accepted')

      // Run review asynchronously
      this.processPRReview(payload).catch(console.error)
    } catch (error) {
      console.error('[PRReviewService] Webhook error:', error)
      res.writeHead(500)
      res.end('Error')
    }
  }

  /**
   * Process PR review
   */
  async processPRReview(payload: GitHubWebhookPayload): Promise<PRReviewResult> {
    const { pull_request, repository } = payload

    console.log(`[PRReviewService] Reviewing PR #${pull_request.number}: ${pull_request.title}`)

    // Publish event
    await this.hub.publish(
      LoomMsgHub.msg(Channel.PR_REVIEW_STARTED, {
        prNumber: pull_request.number,
        repository: repository.full_name,
        title: pull_request.title,
      })
    )

    // Run agents via PipelineRunner
    const agentResults: PRReviewResult['agents'] = []

    for (const agentName of this.config.agents) {
      const result = await this.runAgentReview(agentName, payload)
      agentResults.push(result)
    }

    // Calculate overall status
    const hasFailures = agentResults.some(r => r.status === 'failed')
    const hasWarnings = agentResults.some(r => r.status === 'warning')
    
    const overallStatus = hasFailures 
      ? 'changes_requested' 
      : hasWarnings 
        ? 'comment' 
        : 'approved'

    const totalCost = agentResults.reduce((sum, r) => sum + r.cost, 0)

    const reviewResult: PRReviewResult = {
      prNumber: pull_request.number,
      repository: repository.full_name,
      agents: agentResults,
      summary: this.generateSummary(agentResults),
      overallStatus,
    }

    // Post results
    await this.postReviewComment(reviewResult, payload)

    // Publish completion
    await this.hub.publish(
      LoomMsgHub.msg(Channel.PR_REVIEW_COMPLETED, {
        prNumber: pull_request.number,
        repository: repository.full_name,
        status: overallStatus,
        totalCost,
      })
    )

    return reviewResult
  }

  /**
   * Run a single agent review
   */
  private async runAgentReview(
    agentName: string,
    payload: GitHubWebhookPayload
  ): Promise<PRReviewResult['agents'][0]> {
    const startTime = Date.now()

    // Build task description based on agent
    const task = this.buildAgentTask(agentName, payload)

    try {
      // Run agent via PipelineRunner
      const result = await this.pipelineRunner.runSingleAgent(agentName, task)

      const cost = (result.tokenUsage?.total || 0) * 0.00001 // Approximate cost
      
      // Parse findings from result
      const findings = this.parseFindings(result.content || '')
      
      // Determine status
      let status: 'passed' | 'failed' | 'warning' = 'passed'
      if (findings.some(f => f.includes('CRITICAL') || f.includes('ERROR'))) {
        status = 'failed'
      } else if (findings.some(f => f.includes('WARNING'))) {
        status = 'warning'
      }

      return {
        agentName,
        status,
        findings,
        cost,
      }
    } catch (error) {
      return {
        agentName,
        status: 'failed',
        findings: [`Error running ${agentName}: ${error instanceof Error ? error.message : String(error)}`],
        cost: 0,
      }
    }
  }

  /**
   * Build task description for agent
   */
  private buildAgentTask(agentName: string, payload: GitHubWebhookPayload): string {
    const { pull_request, repository } = payload
    
    const base = `Review PR #${pull_request.number} in ${repository.full_name}

Title: ${pull_request.title}
Description: ${pull_request.body || 'No description'}
Branch: ${pull_request.head.ref} → ${pull_request.base.ref}
Diff: ${pull_request.diff_url}
Author: @${pull_request.user.login}
`

    switch (agentName) {
      case 'security':
        return `${base}

Focus on security issues:
- Check for injection vulnerabilities (SQL, XSS, command injection)
- Verify authentication and authorization
- Look for secrets or credentials in code
- Check for insecure dependencies
- Review access control patterns`

      case 'engineer':
        return `${base}

Focus on code quality:
- Check code style and consistency
- Review error handling
- Verify proper logging
- Check for code smells and anti-patterns
- Review test coverage`

      case 'qa':
        return `${base}

Focus on testing:
- Check if tests are included
- Review test quality and coverage
- Look for edge cases not handled
- Verify test assertions are meaningful`

      default:
        return base
    }
  }

  /**
   * Parse findings from agent output
   */
  private parseFindings(content: string): string[] {
    const findings: string[] = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      // Look for lines with findings markers
      if (line.match(/^(FINDING|ISSUE|WARNING|ERROR|CRITICAL|NOTE):/i)) {
        findings.push(line.trim())
      }
    }
    
    return findings.length > 0 ? findings : ['No specific findings reported']
  }

  /**
   * Generate review summary
   */
  private generateSummary(agentResults: PRReviewResult['agents']): string {
    const passed = agentResults.filter(r => r.status === 'passed').length
    const failed = agentResults.filter(r => r.status === 'failed').length
    const warnings = agentResults.filter(r => r.status === 'warning').length

    let summary = `## Loom Agent Review Summary\n\n`
    summary += `- ✅ Passed: ${passed}\n`
    summary += `- ❌ Failed: ${failed}\n`
    summary += `- ⚠️ Warnings: ${warnings}\n\n`

    summary += `### Agent Results\n\n`
    for (const agent of agentResults) {
      const icon = agent.status === 'passed' ? '✅' : agent.status === 'failed' ? '❌' : '⚠️'
      summary += `**${icon} ${agent.agentName}** (${agent.cost.toFixed(4)} tokens)\n`
      for (const finding of agent.findings.slice(0, 5)) {
        summary += `- ${finding}\n`
      }
      if (agent.findings.length > 5) {
        summary += `- ... and ${agent.findings.length - 5} more findings\n`
      }
      summary += `\n`
    }

    return summary
  }

  /**
   * Post review comment to GitHub
   */
  private async postReviewComment(
    result: PRReviewResult,
    payload: GitHubWebhookPayload
  ): Promise<void> {
    if (!this.config.comments.postSummary) {
      return
    }

    // In production, this would use the GitHub API
    // For now, just log the comment
    console.log(`[PRReviewService] Would post comment to PR #${result.prNumber}:`)
    console.log(result.summary)
  }

  /**
   * Verify GitHub webhook signature
   */
  private verifySignature(payload: string, signature: string): boolean {
    if (!signature || !signature.startsWith('sha256=')) {
      return false
    }

    const expected = crypto
      .createHmac('sha256', this.config.secret)
      .update(payload)
      .digest('hex')

    const actual = signature.replace('sha256=', '')

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(actual, 'hex')
    )
  }

  /**
   * Read request body
   */
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      req.on('end', () => resolve(body))
      req.on('error', reject)
    })
  }
}

// Extend ChannelMap for PR review events
declare module '@loom/core' {
  interface ChannelMap {
    PR_REVIEW_STARTED: { prNumber: number; repository: string; title: string }
    PR_REVIEW_COMPLETED: { prNumber: number; repository: string; status: string; totalCost: number }
  }
}
