import { ContainerModule } from 'inversify'
import { Agent } from '@theia/ai-core/lib/common'
import { LoomOrchestratorAgent } from './fleet/orchestrator-agent'
import { LoomEngineerAgent } from './fleet/engineer-agent'
import { LoomArchitectAgent } from './fleet/architect-agent'
import { LoomReviewerAgent } from './fleet/reviewer-agent'
import { LoomSecurityAgent } from './fleet/security-agent'
import { LoomQAAgent } from './fleet/qa-agent'
import { LoomDevOpsAgent } from './fleet/devops-agent'
import { LoomResearcherAgent } from './fleet/researcher-agent'
import { LoomDocumentarianAgent } from './fleet/documentarian-agent'
import { LoomDataAgent } from './fleet/data-agent'
import { LoomDebuggerAgent } from './fleet/debugger-agent'
import { LoomExplorerAgent } from './fleet/explorer-agent'

export const AGENT_TYPES = {
  Orchestrator: Symbol.for('LoomOrchestratorAgent'),
  Engineer: Symbol.for('LoomEngineerAgent'),
  Architect: Symbol.for('LoomArchitectAgent'),
  Reviewer: Symbol.for('LoomReviewerAgent'),
  Security: Symbol.for('LoomSecurityAgent'),
  QA: Symbol.for('LoomQAAgent'),
  DevOps: Symbol.for('LoomDevOpsAgent'),
  Researcher: Symbol.for('LoomResearcherAgent'),
  Documentarian: Symbol.for('LoomDocumentarianAgent'),
  Data: Symbol.for('LoomDataAgent'),
  Debugger: Symbol.for('LoomDebuggerAgent'),
  Explorer: Symbol.for('LoomExplorerAgent'),
} as const

export default new ContainerModule((bind) => {
  bind(Agent).to(LoomOrchestratorAgent).inSingletonScope()
  bind(Agent).to(LoomEngineerAgent).inSingletonScope()
  bind(Agent).to(LoomArchitectAgent).inSingletonScope()
  bind(Agent).to(LoomReviewerAgent).inSingletonScope()
  bind(Agent).to(LoomSecurityAgent).inSingletonScope()
  bind(Agent).to(LoomQAAgent).inSingletonScope()
  bind(Agent).to(LoomDevOpsAgent).inSingletonScope()
  bind(Agent).to(LoomResearcherAgent).inSingletonScope()
  bind(Agent).to(LoomDocumentarianAgent).inSingletonScope()
  bind(Agent).to(LoomDataAgent).inSingletonScope()
  bind(Agent).to(LoomDebuggerAgent).inSingletonScope()
  bind(Agent).to(LoomExplorerAgent).inSingletonScope()
})
