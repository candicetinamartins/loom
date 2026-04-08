import { injectable, inject, optional } from 'inversify'

export interface SkillLoadInput {
  skillName: string
  version?: string
}

export interface SkillLoadOutput {
  skillName: string
  loaded: boolean
  tools: string[]
}

// Interface to avoid circular dependency with @loom/agents
interface SkillService {
  getSkill(name: string): { tools?: string[] } | undefined
}

@injectable()
export class SkillLoadTool {
  readonly name = 'skill_load'
  readonly description = 'Load a VoltAgent skill'

  constructor(
    @inject('SkillService') @optional() private skillService?: SkillService,
  ) {}

  async execute(input: SkillLoadInput): Promise<SkillLoadOutput> {
    if (!this.skillService) {
      return {
        skillName: input.skillName,
        loaded: false,
        tools: [],
      }
    }

    const skill = this.skillService.getSkill(input.skillName)
    
    if (!skill) {
      return {
        skillName: input.skillName,
        loaded: false,
        tools: [],
      }
    }

    return {
      skillName: input.skillName,
      loaded: true,
      tools: skill.tools || [],
    }
  }
}
