import * as fs from 'fs/promises'
import * as path from 'path'

export interface SpecReadInput {
  specPath: string
}

export interface SpecReadOutput {
  specName: string
  requirements: string | null
  design: string | null
  tasks: string | null
}

export class SpecReadTool {
  readonly name = 'spec_read'
  readonly description = 'Read a spec from the workspace'

  async execute(input: SpecReadInput): Promise<SpecReadOutput> {
    const specDir = path.join('.loom/specs', input.specPath)

    const [requirements, design, tasks] = await Promise.all([
      fs.readFile(path.join(specDir, 'requirements.md'), 'utf-8').catch(() => null),
      fs.readFile(path.join(specDir, 'design.md'), 'utf-8').catch(() => null),
      fs.readFile(path.join(specDir, 'tasks.md'), 'utf-8').catch(() => null),
    ])

    return {
      specName: input.specPath,
      requirements,
      design,
      tasks,
    }
  }
}
