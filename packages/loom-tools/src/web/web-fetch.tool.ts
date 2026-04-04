import { injectable } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'

@injectable()
export class WebFetchTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_web_fetch',
      name: 'web_fetch',
      description: 'Fetch content from a URL. Returns text content (HTML stripped).',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch' },
          maxLength: { type: 'number', description: 'Max characters to return (default: 10000)' },
        },
        required: ['url'],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { url: string; maxLength?: number }
        try {
          const response = await fetch(args.url)
          if (!response.ok) {
            return { result: `Error: HTTP ${response.status} ${response.statusText}` }
          }
          
          const content = await response.text()
          // Simple HTML stripping
          const text = content
            .replace(/<script[^>]*>.*?<\/script>/gs, '')
            .replace(/<style[^>]*>.*?<\/style>/gs, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
          
          const maxLen = args.maxLength ?? 10_000
          return { result: text.length > maxLen ? text.substring(0, maxLen) + '\n... (truncated)' : text }
        } catch (error) {
          return { result: `Error fetching ${args.url}: ${error instanceof Error ? error.message : 'unknown error'}` }
        }
      },
    }
  }
}
