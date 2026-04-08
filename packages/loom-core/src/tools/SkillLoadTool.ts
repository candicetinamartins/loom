import { injectable, inject, optional } from 'inversify'
import { SkillService } from '@loom/agents'

export interface SkillLoadInput {
  skillName: string
  version?: string
}

export interface SkillLoadOutput {
  skillName: string
  loaded: boolean
  tools: string[]
}

@injectable()
export class SkillLoadTool {
  readonly name = 'skill_load'
  readonly description = 'Load a VoltAgent skill'

  constructor(
    @inject(SkillService) @optional() private skillService?: SkillService,
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
