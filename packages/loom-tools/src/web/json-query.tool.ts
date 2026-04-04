import { injectable } from 'inversify'
import { ToolProvider, ToolRequest, ToolInvocationContext, ToolCallResult } from '@theia/ai-core/lib/common'

@injectable()
export class JsonQueryTool implements ToolProvider {
  getTool(): ToolRequest {
    return {
      id: 'loom_json_query',
      name: 'json_query',
      description: 'Fetch JSON from URL and query with dot notation path.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to fetch JSON from' },
          path: { type: 'string', description: 'Dot-notation path (e.g., "data.items.0.name")' },
        },
        required: ['url'],
      },
      handler: async (arg_string: string, ctx?: ToolInvocationContext): Promise<ToolCallResult> => {
        const args = JSON.parse(arg_string) as { url: string; path?: string }
        try {
          const response = await fetch(args.url)
          if (!response.ok) {
            return { result: `Error: HTTP ${response.status}` }
          }
          
          const json = await response.json()
          
          if (!args.path) {
            return { result: JSON.stringify(json, null, 2) }
          }
          
          // Navigate path
          let result: unknown = json
          for (const key of args.path.split('.')) {
            if (result === null || result === undefined) {
              return { result: `Error: path "${args.path}" not found` }
            }
            result = (result as Record<string, unknown>)[key]
          }
          
          return { result: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }
        } catch (error) {
          return { result: `Error: ${error instanceof Error ? error.message : 'unknown error'}` }
        }
      },
    }
  }
}
