import { injectable, inject } from 'inversify'
import { MentionContext, ContextProvider } from '../MentionContextProvider'
import { SkillService } from '@loom/agents'

@injectable()
export class SkillContextProvider implements ContextProvider {
  readonly type = 'skill'
  readonly prefix = 'skill:'

  constructor(
    @inject(SkillService) private skillService: SkillService,
  ) {}

  async provideContext(mention: string): Promise<MentionContext> {
    const skillName = mention.substring(this.prefix.length)

    try {
      // Load skill content
      const skill = await this.skillService.getSkill(skillName)
      
      if (!skill) {
        // List available skills
        const allSkills = await this.skillService.getAllSkills()
        const available = allSkills.slice(0, 10).map(s => `- ${s.name}`).join('\n')
        
        return {
          type: this.type,
          content: `Skill "${skillName}" not found. Available skills:\n${available}${allSkills.length > 10 ? `\n... and ${allSkills.length - 10} more` : ''}`,
          tokens: 20,
        }
      }

      const content = `[SKILL: ${skill.name}]\n${skill.description || 'No description'}\n\n${skill.content ? skill.content.slice(0, 500) : ''}`

      return {
        type: this.type,
        content,
        tokens: Math.ceil(content.length / 4),
      }
    } catch (error) {
      return {
        type: this.type,
        content: `Skill lookup error: ${error instanceof Error ? error.message : String(error)}`,
        tokens: 10,
      }
    }
  }
}
