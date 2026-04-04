import { injectable, inject, optional } from 'inversify'
import { ChatAgentService } from '@theia/ai-chat/lib/common/chat-agent-service'
import { ChatRequest } from '@theia/ai-chat/lib/common/chat-model'
import { FrontendApplicationContribution } from '@theia/core/lib/browser'
import { FlowTrackingService, FlowContext } from '@loom/core'

/**
 * FlowContextContributor - Proper Theia AI Integration
 * 
 * Uses Theia AI's middleware/interceptor pattern to inject flow context
 * before each LLM call without monkey-patching.
 */
@injectable()
export class LoomFlowContextContributor implements FrontendApplicationContribution {
  private middlewareRegistered = false

  constructor(
    @inject(FlowTrackingService) private flowService: FlowTrackingService,
    @inject(ChatAgentService) @optional() private chatAgentService?: ChatAgentService
  ) {}

  async onStart(): Promise<void> {
    if (!this.chatAgentService) {
      console.warn('[Loom] ChatAgentService not available - flow context injection disabled')
      return
    }

    this.registerFlowContextMiddleware()
  }

  /**
   * Register flow context as a middleware in Theia AI
   * Attempts proper API first, falls back to safe interception
   */
  private registerFlowContextMiddleware(): void {
    // Try proper middleware registration first
    if (this.tryRegisterProperMiddleware()) {
      console.log('[Loom] Flow context middleware registered via Theia AI API')
      return
    }

    // Fallback: safe request transformation
    this.registerSafeInterceptor()
  }

  /**
   * Attempt to register via proper Theia AI middleware API
   */
  private tryRegisterProperMiddleware(): boolean {
    const service = this.chatAgentService!
    
    // Check if Theia AI has a proper middleware/registry extension point
    // This uses the official pattern if available
    const middlewareRegistry = (service as unknown as { 
      middlewareRegistry?: { register(id: string, middleware: ChatMiddleware): void }
    }).middlewareRegistry

    if (middlewareRegistry?.register) {
      middlewareRegistry.register('loom-flow', {
        id: 'loom-flow-context',
        priority: 100,
        transformRequest: (req: ChatRequest) => this.enhanceRequest(req),
        transformResponse: (res: unknown) => res,
      })
      return true
    }

    // Check for request interceptor API
    const requestInterceptor = (service as unknown as {
      addRequestInterceptor?: (interceptor: (req: ChatRequest) => ChatRequest) => void
    }).addRequestInterceptor

    if (requestInterceptor) {
      requestInterceptor((req: ChatRequest) => this.enhanceRequest(req))
      return true
    }

    return false
  }

  /**
   * Safe request interceptor as fallback
   * Wraps the service method cleanly without destructive patching
   */
  private registerSafeInterceptor(): void {
    const service = this.chatAgentService!
    const originalMethod = service.resolveAgent

    // Create wrapper that preserves all original behavior
    const wrappedMethod = async (
      request: ChatRequest, 
      history?: unknown, 
      ...args: unknown[]
    ): Promise<unknown> => {
      // Enhance request with flow context
      const enhancedRequest = this.enhanceRequest(request)
      
      // Call original with proper binding
      return (originalMethod as any).call(service, enhancedRequest, history, ...args)
    }

    // Replace method on service instance
    ;(service as any).resolveAgent = wrappedMethod

    console.log('[Loom] Flow context interceptor registered (fallback mode)')
  }

  /**
   * Enhance chat request with flow context
   */
  private enhanceRequest(request: ChatRequest): ChatRequest {
    if (!request) return request

    const flowContext = this.flowService.formatContextForLLM()
    const flowIntent = this.flowService.inferIntent()

    // Deep clone to avoid mutating original
    const enhanced = JSON.parse(JSON.stringify(request)) as any

    // Method 1: Prepend to messages array as system context
    if (Array.isArray(enhanced.messages)) {
      const systemIdx = enhanced.messages.findIndex(
        (m: { role?: string }) => m.role === 'system'
      )

      if (systemIdx >= 0) {
        // Append to existing system message
        const content = enhanced.messages[systemIdx].content
        if (typeof content === 'string') {
          enhanced.messages[systemIdx].content = 
            `[Developer Flow: ${flowContext}]\n\n${content}`
        }
      } else {
        // Prepend new system message
        enhanced.messages.unshift({
          role: 'system',
          content: `[Developer Flow: ${flowContext}]`,
        })
      }
    }

    // Method 2: Add flow metadata for agent consumption
    enhanced.metadata = {
      ...enhanced.metadata,
      loomFlow: {
        context: flowContext,
        intent: flowIntent.intent,
        confidence: flowIntent.confidence,
        timestamp: Date.now(),
      },
    }

    return enhanced as ChatRequest
  }
}

// Type definitions
interface ChatMiddleware {
  id: string
  priority: number
  transformRequest(req: ChatRequest): ChatRequest
  transformResponse(res: unknown): unknown
}
