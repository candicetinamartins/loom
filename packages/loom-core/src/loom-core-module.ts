import { ContainerModule } from 'inversify'
import { LoomMsgHub } from './orchestration/LoomMsgHub'
import { PipelineRunner } from './orchestration/PipelineRunner'
import { OrchestrationVerifier } from './orchestration/OrchestrationVerifier'
import { ToolGroupRegistry, registerBuiltinGroups } from './tools/ToolGroupRegistry'
import { ContextBudgetManager } from './context/ContextBudgetManager'
import { ContextCompactor } from './context/ContextCompactor'
import { ContextProviderRegistry } from './context/ContextProviderRegistry'
import { TokenUsageTracker } from './agents/TokenUsageTracker'
import { SecretService } from './services/SecretService'
import { RateLimiter } from './services/RateLimiter'
import { FlowTrackingService } from './services/FlowTrackingService'
import { TOMLParser } from './config/TOMLParser'
import { ConversationHistoryService } from './services/ConversationHistoryService'

export const TYPES = {
  LoomMsgHub: Symbol.for('LoomMsgHub'),
  PipelineRunner: Symbol.for('PipelineRunner'),
  OrchestrationVerifier: Symbol.for('OrchestrationVerifier'),
  ToolGroupRegistry: Symbol.for('ToolGroupRegistry'),
  ContextBudgetManager: Symbol.for('ContextBudgetManager'),
  ContextCompactor: Symbol.for('ContextCompactor'),
  ContextProviderRegistry: Symbol.for('ContextProviderRegistry'),
  TokenUsageTracker: Symbol.for('TokenUsageTracker'),
  SecretService: Symbol.for('SecretService'),
  RateLimiter: Symbol.for('RateLimiter'),
  ConversationHistoryService: Symbol.for('ConversationHistoryService'),
  FlowTrackingService: Symbol.for('FlowTrackingService'),
  TOMLParser: Symbol.for('TOMLParser'),
} as const

export default new ContainerModule((bind) => {
  bind(TYPES.LoomMsgHub).to(LoomMsgHub).inSingletonScope()
  bind(TYPES.PipelineRunner).to(PipelineRunner).inSingletonScope()
  bind(TYPES.OrchestrationVerifier).to(OrchestrationVerifier).inSingletonScope()
  bind(TYPES.ToolGroupRegistry).to(ToolGroupRegistry).inSingletonScope()
  bind(TYPES.ContextBudgetManager).to(ContextBudgetManager).inSingletonScope()
  bind(TYPES.ContextCompactor).to(ContextCompactor).inSingletonScope()
  bind(TYPES.ContextProviderRegistry).to(ContextProviderRegistry).inSingletonScope()
  bind(TYPES.TokenUsageTracker).to(TokenUsageTracker).inSingletonScope()
  bind(TYPES.SecretService).to(SecretService).inSingletonScope()
  bind(TYPES.RateLimiter).to(RateLimiter).inSingletonScope()
  bind(TYPES.ConversationHistoryService).to(ConversationHistoryService).inSingletonScope()
  bind(TYPES.FlowTrackingService).to(FlowTrackingService).inSingletonScope()
  bind(TYPES.TOMLParser).to(TOMLParser).inSingletonScope()
})

export function initializeLoomCore(registry: ToolGroupRegistry): void {
  registerBuiltinGroups(registry)
}
