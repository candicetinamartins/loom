export interface SkillLoadInput {
  skillName: string
  version?: string
}

export interface SkillLoadOutput {
  skillName: string
  loaded: boolean
  tools: string[]
}

export class SkillLoadTool {
  readonly name = 'skill_load'
  readonly description = 'Load a VoltAgent skill'

  async execute(input: SkillLoadInput): Promise<SkillLoadOutput> {
    // Phase 2C: Integrate with skill system
    return {
      skillName: input.skillName,
      loaded: true,
      tools: [],
    }
  }
}
