import { injectable } from 'inversify'
import { ToolProvider, ToolRequest } from '@theia/ai-core/lib/common'

@injectable()
export class WebFetchTool implements ToolProvider {
  getTools(): ToolRequest[] {
    return [{
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
      handler: async (args: { url: string; maxLength?: number }) => {
        try {
          const response = await fetch(args.url)
          if (!response.ok) {
            return `Error: HTTP ${response.status} ${response.statusText}`
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
          return text.length > maxLen ? text.substring(0, maxLen) + '\n... (truncated)' : text
        } catch (error) {
          return `Error fetching ${args.url}: ${error instanceof Error ? error.message : 'unknown error'}`
        }
      },
    }]
  }
}
