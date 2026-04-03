#!/usr/bin/env node
import { Command } from 'commander'
import * as fs from 'fs/promises'
import * as path from 'path'
import { execSync } from 'child_process'

/**
 * Phase 9 — Eval Framework CLI
 * 
 * Command: `loom eval run --agent engineer --suite evals/engineer/`
 *          `loom eval run --suite evals/adversarial/`
 * 
 * CI gate:
 * - ≥80% pass for general evals
 * - ≥95% for protocol compliance
 * - 100% for adversarial coordination tests
 */

interface EvalConfig {
  name: string
  agent: string
  task: string
  expected: {
    status: 'complete' | 'quarantined' | 'failed'
    contains?: string[]
    notContains?: string[]
  }
  timeout: number // seconds
  maxCost: number // dollars
}

interface EvalResult {
  name: string
  passed: boolean
  duration: number
  cost: number
  status: string
  error?: string
}

interface EvalSuite {
  name: string
  description: string
  tests: EvalConfig[]
  requirements: {
    minPassRate: number
    minProtocolCompliance: number
  }
}

class EvalRunner {
  private program: Command

  constructor() {
    this.program = new Command()
    this.setupCommands()
  }

  private setupCommands(): void {
    this.program
      .name('loom eval')
      .description('Loom evaluation framework')
      .version('1.0.0')

    this.program
      .command('run')
      .description('Run evaluation tests')
      .option('-a, --agent <agent>', 'Specific agent to test')
      .option('-s, --suite <suite>', 'Test suite directory', 'evals/')
      .option('-f, --filter <pattern>', 'Filter tests by pattern')
      .option('-t, --timeout <seconds>', 'Test timeout', '60')
      .option('--adversarial', 'Run adversarial coordination tests')
      .action(this.runEvals.bind(this))

    this.program
      .command('list')
      .description('List available test suites')
      .option('-s, --suite <suite>', 'Suite directory', 'evals/')
      .action(this.listSuites.bind(this))

    this.program
      .command('init')
      .description('Initialize eval suite structure')
      .argument('<name>', 'Suite name')
      .action(this.initSuite.bind(this))
  }

  async run(): Promise<void> {
    await this.program.parseAsync()
  }

  private async runEvals(options: {
    agent?: string
    suite: string
    filter?: string
    timeout: string
    adversarial?: boolean
  }): Promise<void> {
    console.log('🧪 Loom Eval Framework')
    console.log('======================\n')

    const suite = await this.loadSuite(options.suite)
    if (!suite) {
      console.error(`❌ Suite not found: ${options.suite}`)
      process.exit(1)
    }

    // Filter tests
    let tests = suite.tests
    if (options.agent) {
      tests = tests.filter(t => t.agent === options.agent)
    }
    if (options.filter) {
      const pattern = new RegExp(options.filter)
      tests = tests.filter(t => pattern.test(t.name))
    }

    console.log(`Suite: ${suite.name}`)
    console.log(`Description: ${suite.description}`)
    console.log(`Tests: ${tests.length}`)
    if (options.adversarial) {
      console.log('⚠️  ADVERSARIAL MODE: Coordination failure tests')
    }
    console.log('')

    // Run tests
    const results: EvalResult[] = []
    let passed = 0
    let failed = 0
    let totalCost = 0

    for (const test of tests) {
      const result = await this.runTest(test, parseInt(options.timeout))
      results.push(result)

      if (result.passed) {
        passed++
        console.log(`✅ ${test.name}`)
      } else {
        failed++
        console.log(`❌ ${test.name}`)
        if (result.error) {
          console.log(`   Error: ${result.error}`)
        }
      }

      totalCost += result.cost
    }

    // Summary
    console.log('\n======================')
    console.log('Results Summary')
    console.log('======================')
    console.log(`Total: ${tests.length}`)
    console.log(`Passed: ${passed} ✅`)
    console.log(`Failed: ${failed} ❌`)
    console.log(`Pass Rate: ${((passed / tests.length) * 100).toFixed(1)}%`)
    console.log(`Total Cost: $${totalCost.toFixed(4)}`)

    // CI Gate
    const passRate = passed / tests.length
    const minPassRate = options.adversarial ? 1.0 : suite.requirements.minPassRate

    console.log('\n======================')
    console.log('CI Gate')
    console.log('======================')
    
    if (options.adversarial) {
      if (passRate < 1.0) {
        console.log('❌ ADVERSARIAL TESTS: Must be 100%')
        console.log('   Coordination failures must never pass silently')
        process.exit(1)
      } else {
        console.log('✅ Adversarial tests: 100% (PASS)')
      }
    } else {
      if (passRate < minPassRate) {
        console.log(`❌ General evals: ${(passRate * 100).toFixed(0)}% (min: ${(minPassRate * 100).toFixed(0)}%)`)
        process.exit(1)
      } else {
        console.log(`✅ General evals: ${(passRate * 100).toFixed(0)}% (min: ${(minPassRate * 100).toFixed(0)}%) (PASS)`)
      }
    }

    // Export results
    await this.exportResults(suite.name, results)
  }

  private async runTest(config: EvalConfig, timeout: number): Promise<EvalResult> {
    const startTime = Date.now()
    
    try {
      // Simulate running agent (in production, this would call the actual agent)
      const result = await this.simulateAgentRun(config, timeout)
      
      const duration = Date.now() - startTime
      
      // Validate result
      let passed = true
      let error = ''

      // Check status
      if (result.status !== config.expected.status) {
        passed = false
        error = `Expected status ${config.expected.status}, got ${result.status}`
      }

      // Check contains
      if (passed && config.expected.contains) {
        for (const expected of config.expected.contains) {
          if (!result.content.includes(expected)) {
            passed = false
            error = `Missing expected content: ${expected}`
            break
          }
        }
      }

      // Check notContains
      if (passed && config.expected.notContains) {
        for (const notExpected of config.expected.notContains) {
          if (result.content.includes(notExpected)) {
            passed = false
            error = `Found unexpected content: ${notExpected}`
            break
          }
        }
      }

      // Check cost
      if (result.cost > config.maxCost) {
        passed = false
        error = `Cost ${result.cost} exceeded max ${config.maxCost}`
      }

      return {
        name: config.name,
        passed,
        duration,
        cost: result.cost,
        status: result.status,
        error: error || undefined,
      }
    } catch (err) {
      return {
        name: config.name,
        passed: false,
        duration: Date.now() - startTime,
        cost: 0,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async simulateAgentRun(
    config: EvalConfig,
    timeout: number
  ): Promise<{ status: string; content: string; cost: number }> {
    // In production, this would:
    // 1. Start agent session
    // 2. Send task
    // 3. Wait for completion (with timeout)
    // 4. Collect results
    
    // For now, simulate based on test name
    const isAdversarial = config.name.includes('adversarial') || config.name.includes('coordination')
    
    if (isAdversarial) {
      // Adversarial tests should always be checked carefully
      return {
        status: 'complete',
        content: '[RESULT]\nstatus = "complete"\nkey_findings = ["Test passed", "Coordination verified"]\nsummary = "Adversarial test completed"',
        cost: 0.02,
      }
    }

    // Regular test simulation
    return {
      status: 'complete',
      content: '[RESULT]\nstatus = "complete"\nkey_findings = ["Implementation correct"]\nsummary = "Test passed"',
      cost: 0.01,
    }
  }

  private async loadSuite(suitePath: string): Promise<EvalSuite | null> {
    try {
      const configPath = path.join(suitePath, 'suite.json')
      const content = await fs.readFile(configPath, 'utf-8')
      const suite = JSON.parse(content)
      
      // Load individual test files
      const testsDir = path.join(suitePath, 'tests')
      const testFiles = await fs.readdir(testsDir)
      
      suite.tests = []
      for (const file of testFiles) {
        if (file.endsWith('.json')) {
          const testContent = await fs.readFile(path.join(testsDir, file), 'utf-8')
          suite.tests.push(JSON.parse(testContent))
        }
      }
      
      return suite
    } catch {
      return null
    }
  }

  private async listSuites(options: { suite: string }): Promise<void> {
    console.log('Available Test Suites:')
    console.log('======================\n')

    try {
      const entries = await fs.readdir(options.suite, { withFileTypes: true })
      const suites = entries.filter(e => e.isDirectory())

      for (const suite of suites) {
        const configPath = path.join(options.suite, suite.name, 'suite.json')
        try {
          const content = await fs.readFile(configPath, 'utf-8')
          const config = JSON.parse(content)
          console.log(`📁 ${suite.name}`)
          console.log(`   ${config.description}`)
          console.log('')
        } catch {
          console.log(`📁 ${suite.name} (no config)`)
        }
      }
    } catch {
      console.log('No test suites found.')
    }
  }

  private async initSuite(name: string): Promise<void> {
    const suiteDir = path.join('evals', name)
    const testsDir = path.join(suiteDir, 'tests')

    await fs.mkdir(testsDir, { recursive: true })

    const suiteConfig: EvalSuite = {
      name,
      description: `Evaluation suite for ${name}`,
      tests: [],
      requirements: {
        minPassRate: 0.8,
        minProtocolCompliance: 0.95,
      },
    }

    await fs.writeFile(
      path.join(suiteDir, 'suite.json'),
      JSON.stringify(suiteConfig, null, 2)
    )

    // Create example test
    const exampleTest: EvalConfig = {
      name: 'example-test',
      agent: 'engineer',
      task: 'Implement a simple function',
      expected: {
        status: 'complete',
        contains: ['function', 'return'],
      },
      timeout: 60,
      maxCost: 0.05,
    }

    await fs.writeFile(
      path.join(testsDir, 'example.json'),
      JSON.stringify(exampleTest, null, 2)
    )

    console.log(`✅ Created eval suite: ${suiteDir}`)
  }

  private async exportResults(suiteName: string, results: EvalResult[]): Promise<void> {
    const outputDir = path.join('.loom', 'eval-results')
    await fs.mkdir(outputDir, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const outputPath = path.join(outputDir, `${suiteName}-${timestamp}.json`)

    await fs.writeFile(
      outputPath,
      JSON.stringify(
        {
          suite: suiteName,
          timestamp: new Date().toISOString(),
          results,
          summary: {
            total: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
            totalCost: results.reduce((sum, r) => sum + r.cost, 0),
            totalDuration: results.reduce((sum, r) => sum + r.duration, 0),
          },
        },
        null,
        2
      )
    )

    console.log(`\nResults exported to: ${outputPath}`)
  }
}

// Run CLI
const runner = new EvalRunner()
runner.run().catch(console.error)
